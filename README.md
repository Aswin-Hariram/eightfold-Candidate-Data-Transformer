# Multi-Source Candidate Data Transformer — One-Pager

A deterministic Node.js engine that ingests messy candidate data from many sources
(structured **CSV / ATS JSON**, unstructured **Resumes TXT/PDF/DOCX**, **Recruiter Notes**,
plus live **GitHub / LinkedIn** enrichment), reconciles conflicts, and emits a single
**canonical profile per candidate** under a **runtime-configurable output schema**.

> Primary interface is the **CLI** (`node-server/`). The React web UI is an optional,
> nice-to-have visualizer built on the exact same pipeline.

---

## 1. Pipeline / step breakdown

```
detect ─▶ extract ─▶ normalize ─▶ enrich ─▶ resolve ─▶ merge ─▶ project ─▶ validate
```

| Step | What happens |
|------|--------------|
| **detect**    | Classify each input by extension/name (`.csv`→ATS recruiter CSV, `.json`→ATS export, `*notes*`→recruiter notes, `.pdf/.docx/.txt`→resume). |
| **extract**   | Source-specific parsers turn each file into raw `{source, candidate_id, confidence, data}` records. |
| **normalize** | Pure, deterministic functions clean every field (see §2). Unparsable input becomes `null` — never invented. |
| **enrich**    | Any `github.com` / `linkedin.com` link found in any record triggers a live API fetch, added as a new source-tagged record. |
| **resolve**   | Entity resolution (union-find) fuzzy-merges duplicate candidates that lack a shared `candidate_id`. |
| **merge**     | Per-candidate conflict resolution: confidence-weighted voting for scalars, deduped union for lists, with provenance. |
| **project**   | Apply the runtime output config (field renames, `from` paths, per-field normalizers, missing policy). |
| **validate**  | Structural config validation + output completeness check; emits `{ok, errors[]}`. |

---

## 2. Canonical schema & normalized formats

**Canonical profile**
```
candidate_id, full_name, emails[], phones[], location{city, region, country, raw},
links[{url,type}], headline, years_experience, skills[],
experience[{company,title,start_date,end_date,location}],
education[{institution,degree,field,graduation_date}],
provenance{}, overall_confidence
```

**Normalized formats (chosen for determinism + comparability)**
- **Email** → trimmed, lowercased, RFC-ish validated (else `null`).
- **Phone** → **E.164** via `libphonenumber-js` (else `null`).
- **Date** → **`YYYY-MM`** (e.g. `Jan 2021`→`2021-01`); `present/current/now`→`present`.
- **Country** → **ISO-3166 alpha-2** (`United States`→`US`).
- **Location** → split into `{city, region, country, raw}`.
- **Skill** → canonicalized via alias map (`js`→`JavaScript`, `k8s`→`Kubernetes`), acronyms preserved, others title-cased; URLs/emails rejected.
- **Name** → Title Case, whitespace collapsed.
- **URL** → normalized `origin + path` with TLD sanity check; classified (`github`/`linkedin`/`twitter`/…).

---

## 3. Merge / conflict-resolution policy & confidence

**Match keys (how records group into one candidate)**
1. Explicit shared `candidate_id`.
2. Entity resolution otherwise — **strong signals** (shared email, phone, GitHub or LinkedIn handle) merge immediately; **weak signal** (name match, token-set Jaccard ≥ 0.85, **and** shared city/country) merges only when both hold. Union-find keeps it deterministic.

**Picking a winner**
- **Scalars** (name, headline, location, years): confidence-weighted **voting**. Each value's weight = `SOURCE_WEIGHT × record_confidence`, summed across records that agree. Highest weight wins; ties broken by source priority then deterministic key order. Losers are retained as `conflicts.<field>.alternates`.
- **Lists** (emails, phones, skills, links, experience, education): **deduped union**; each item records its contributing sources as provenance.

**Source weights** `ats_json 1.0 · linkedin 0.9 · recruiter_csv 0.85 · github 0.8 · resume 0.7 · recruiter_notes 0.4`

**Confidence**
- Per-field = `winning_weight / total_weight_for_field`.
- Overall = mean of present-field confidences. Every field carries provenance + confidence in the output.

---

## 4. Runtime custom-output config (projection + validation)

A config is plain JSON:
```json
{
  "fields": [
    { "key": "primary_email", "from": "emails[0]" },
    { "key": "phone", "from": "phones[0]", "normalize": "phone" },
    { "key": "city", "from": "location.city" }
  ],
  "missing_policy": "null",        // null | omit | error
  "include_provenance": true,
  "include_confidence": true
}
```
- **Projection** — `from` supports dotted + indexed paths (`a.b[0].c`); optional per-field `normalize` (phone/email/name/date/country/skill/lowercase/uppercase); `missing_policy` decides `null` vs drop vs throw.
- **Validation** — `validateConfig()` (shared by CLI + UI + `POST /api/configs/validate`) blocks on errors (missing `key`, duplicate keys, unknown normalizer, bad `missing_policy`) and warns on unknown `from` paths. Output is then checked for completeness.

---

## 5. Edge cases handled (and what's deliberately left out)

**Handled**
1. **Missing `candidate_id`** → derived deterministically from first email (`derived_<local>`) or filename, so the same person links across files.
2. **Same person, no shared id, conflicting values** → fuzzy entity resolution + conflict tracking (winner + struck-through alternates).
3. **Garbage / unparsable fields** (e.g. `"years": "lots"`, malformed phone) → coerced to `null`, never guessed.
4. **Multi-column / flattened PDF text** → heading-sniffing + pipe/prose dual-pattern experience parsing + lexicon fallback for skills.
5. **GitHub rate limit / 404** → returns a low-confidence record carrying the error, pipeline never crashes.

**Left out under time pressure**
- Real LinkedIn scraping (ToS — handle/URL captured only; pluggable behind `LINKEDIN_API_KEY`).
- OCR for scanned/image PDFs.
- Persistent storage + async job queue for very large (10k+) batches.
- ML-based entity resolution (current rules are explainable and deterministic by design).

---

*See `node-server/README.md` (CLI guide) and `frontend/README.md` (web UI guide) for usage.
A printable version of this page is in `Candidate_Transformer_OnePager.pdf`.*
