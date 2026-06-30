# DESIGN — Multi-Source Candidate Data Transformer

## 1. Pipeline

```
files  ─►  detect       ─►  extract        ─►  normalize             ─►  group by id
            (by name)      (per-source        (pure functions:
                            parsers)           E.164, ISO-2, dates,
                                               skill aliases…)
                                                                          │
                                                                          ▼
output  ◄─ validate ◄─ project to output ◄─ confidence ◄─  merge & resolve conflicts
                       (runtime config)     (weighted)       (hybrid policy)
```

Every stage is a pure function (except file I/O at the edges). Each candidate record carries its source label all the way to merge, so provenance is always traceable.

## 2. Canonical schema

| Field              | Type        | Normalization                          |
|--------------------|-------------|----------------------------------------|
| `candidate_id`     | string      | passthrough                            |
| `full_name`        | string      | Title-case, single-space               |
| `emails`           | string[]    | lowercase, RFC-ish validation          |
| `phones`           | string[]    | E.164 via libphonenumber-js            |
| `location`         | object      | `{city, region, country, raw}`, country → ISO-3166 alpha-2 |
| `links`            | object[]    | url normalized, `type` classified      |
| `headline`         | string      | trimmed                                |
| `years_experience` | number      | numeric coercion or null               |
| `skills`           | string[]    | alias map → canonical names, sorted    |
| `experience`       | object[]    | `{company, title, start_date (YYYY-MM), end_date, location}` |
| `education`        | object[]    | `{institution, degree, field, graduation_date}`              |
| `provenance`       | object      | per-field source list                  |
| `overall_confidence` | number    | mean of present field confidences      |

## 3. Conflict-resolution / merge policy (hybrid)

**Source weights** (priority order, higher = more trusted):

| Source           | Weight | Default record-level confidence |
|------------------|--------|----------------------------------|
| `ats_json`       | 1.00   | 0.95                            |
| `recruiter_csv`  | 0.85   | 0.90                            |
| `resume`         | 0.70   | 0.80                            |
| `recruiter_notes`| 0.40   | 0.55                            |

For **scalar fields** (`full_name`, `headline`, `location`, `years_experience`):
  - Each candidate value gets a score = `Σ (source_weight × record_confidence)`.
  - Top score wins. Tie-breaker is deterministic (JSON-string lexicographic).
  - Field confidence = winner's score / total score across all candidates.

For **list fields** (`emails`, `phones`, `links`, `skills`, `experience`, `education`):
  - Union of all sources, deduped by a per-field key function (e.g. lowercased email, normalized phone, `company|title|start` for experience).
  - Item-level provenance is recorded.
  - Field confidence = mean weight across items, clamped to 1.

**Overall confidence** = mean of present-field confidences (fields with no signal are skipped, not penalised).

## 4. Runtime output config

The `project.js` stage applies a JSON-only config: it does not read code. The config declares:

- `fields[]` — list of `{key, from, normalize?}` triples. `from` supports dotted-path and `[n]` indexing.
- `include_provenance` / `include_confidence` toggles.
- `missing_policy: "null" | "omit" | "error"` — what to do when the source path resolves to `null`/`undefined`/empty array.

Per-field normalizers (`phone`, `email`, `name`, `date`, `country`, `skill`, `lowercase`, `uppercase`) re-use the same pure functions that the source parsers used during canonicalization, guaranteeing consistency.

A light validation pass after projection checks that all declared keys exist in the output (unless `missing_policy=omit`).

## 5. Determinism guarantees

- All parsers are pure functions of their input string.
- Skill lists are sorted alphabetically after canonicalization.
- Merge ties break on JSON-string lexicographic order.
- `Date.now()` is only used for the `generated_at` envelope field, never inside the pipeline.

Same inputs + same config → byte-identical output.

## 6. Edge cases (explicitly handled)

1. **Invalid scalar values** (e.g. phone `not-a-number`, years `not_a_number`): normalizers return `null`. The field simply won't contribute to the merge.
2. **Orphan unstructured records** (notes block with an unknown `CANDIDATE_ID`): kept in `stats.orphan_records` and *not* emitted as a candidate — "honestly-empty beats wrong-but-confident".
3. **Conflicting casing / formatting** (CSV "JOHN SMITH" vs ATS "John Smith"): normalization collapses them in the merge; provenance keeps both source labels.
4. **Multiple emails / phones across sources**: union'd, deduped on a normalized key.
5. **Country strings we don't recognise**: return `null` rather than guessing — pipeline never invents data.

## 7. Trade-offs / explicitly out of scope

- **PDF/DOCX resume parsing**: implemented via `pdf-parse` v2 and `mammoth`. After text extraction the heuristics live in `sources/resume_doc.js` (section sniffing + regex sweeps). Falls back to a skill lexicon when no `Skills:` heading is present. Deliberately not LLM-backed, so it stays deterministic and debuggable.
- **Fuzzy candidate matching** (when no shared `candidate_id` exists): implemented in `transformer/resolve.js`. Strong signals (email, phone, github handle, linkedin handle) immediately merge two groups; the combination of name match + shared city/country also triggers a merge. Deterministic via union-find with lex-smaller id as root. The `stats.resolution.merges` array preserves the audit trail.
- **LLM-based extraction** for notes: deliberately avoided. The lexicon + regex approach is deterministic, debuggable, and good enough for the demo set. It can be replaced behind the `sources/notes.js` boundary without touching the rest of the pipeline.
