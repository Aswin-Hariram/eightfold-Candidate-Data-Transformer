# Multi-Source Candidate Data Transformer — Backend (Node.js)

A production-ready Node.js pipeline that ingests messy candidate data from multiple sources (CSV, ATS JSON, resumes, recruiter notes), normalizes it, resolves conflicts using a **hybrid source-priority + confidence-weighted policy**, and emits a single canonical profile per candidate — with **provenance** and **per-field confidence**.

The output schema is **runtime-configurable**: pick fields, rename them, attach per-field normalizers, toggle provenance/confidence, and choose a missing-value policy — **all without changing code**.

This package contains the **core pipeline**, the **CLI**, and the optional **Express API** that the React UI talks to.
<img width="1024" height="559" alt="image" src="https://github.com/user-attachments/assets/9af754c4-7449-4efa-b384-863a31d6167f" />

---

## 🚀 Quick Start

```bash
cd node-server
yarn install                    # or npm install

# Run the test suite (24 deterministic, offline tests)
yarn test




# Transform the bundled sample data
#   → prints JSON to stdout AND auto-saves to outputs/transform-<timestamp>.json
node src/cli/index.js --sample

# The output is saved to `output/custom-recruiter.json`.
node src/cli/index.js --inputs sample-data --config configs/custom-recruiter.json --out output/custom-recruiter.json

# Use a named config and a human-readable table view
node src/cli/index.js --sample --config hiring-manager --format table

# Write JSON to a specific file
node src/cli/index.js --sample --out output/default.json
```

> **CLI default = JSON.** As of the latest version the CLI emits **JSON only** by default and **auto-saves the result to `outputs/`**. Other views (`summary`, `table`, `conflicts`) are produced only when you ask via `--format`.

---

## ✨ Key Features

- **Multi-format input**: CSV, JSON, TXT (resumes + recruiter notes), PDF, DOCX
- **Smart entity resolution**: merges duplicate candidates across sources using email, phone, GitHub/LinkedIn handles, and fuzzy name matching (Union-Find)
- **Conflict resolution**: hybrid policy combining source priority and confidence scores, with full alternate tracking
- **Runtime-configurable output**: define your own schema (fields, renames, normalizers, policies) without changing code
- **Provenance + confidence**: know which source contributed each value and how trustworthy it is
- **Web enrichment**: auto-fetch GitHub profiles (optional `GITHUB_TOKEN` for higher rate limits)
- **CLI-first**: powerful command-line interface with JSON-by-default output and auto-save
- **Optional Web UI**: Express API + React frontend for interactive use

---

## 📁 Project Structure

```
node-server/
├── configs/                         # Runtime output configurations
│   ├── default.json                 # Standard output with all fields
│   ├── hiring-manager.json          # Manager-focused summary
│   └── custom-recruiter.json        # Recruiter-specific view
│
├── outputs/                         # CLI auto-saves JSON results here (default)
│   └── transform-<timestamp>.json
│
├── output/                          # Demo-script outputs (npm run demo:*)
│
├── sample-data/                     # Candidates across 5 source types
│   ├── structured/
│   │   ├── ats_export.json          # ATS export records
│   │   └── recruiters.csv           # Recruiter spreadsheet rows
│   ├── unstructured/
│   │   ├── recruiter_notes.txt      # Freeform notes blocks (--- separated)
│   │   ├── resume_akira_tanaka.txt  # Text resumes with labeled sections
│   │   ├── resume_amir_hossein.txt
│   │   ├── resume_carlos_ramirez.txt
│   │   ├── resume_jane_doe.txt
│   │   ├── resume_rohan_mehta.txt
│   │   ├── resume_sara_lima.txt
│   │   └── resume_theo_brennan.txt
│   └── uploads/
│       ├── resume_rachel_kim.pdf    # Parsed via pdf-parse
│       └── resume_diana_lopez.docx  # Parsed via mammoth
│
├── src/
│   ├── cli/
│   │   └── index.js                 # CLI entry point (JSON default + auto-save)
│   ├── transformer/                 # Core transformation logic
│   │   ├── normalize.js             # Pure normalization helpers
│   │   ├── schema.js                # Canonical schema + source weights
│   │   ├── merge.js                 # Conflict resolution / provenance
│   │   ├── resolve.js               # Entity resolution (duplicate detection)
│   │   ├── project.js               # Runtime schema application
│   │   ├── validate-config.js       # Output-config validation (CLI + API)
│   │   └── pipeline.js              # Main pipeline orchestrator
│   ├── sources/                     # Input parsers and enrichments
│   │   ├── csv.js                   # CSV parser
│   │   ├── json.js                  # JSON parser
│   │   ├── resume.js                # TXT resume parser
│   │   ├── notes.js                 # Recruiter notes parser
│   │   ├── resume_doc.js            # PDF/DOCX parser
│   │   ├── github.js                # GitHub enrichment
│   │   └── linkedin.js              # LinkedIn enrichment
│   └── server.js                    # Express API (optional, port 8002)
│
├── test/
│   └── run.js                       # 24 passing, deterministic offline tests
│
├── package.json
└── README.md                        # This file
```

---

## 🖥️ CLI Usage

The CLI is the primary interface. **By default it prints JSON to stdout and saves a copy to `outputs/`.**

### Basic Commands

```bash
# Transform sample data → JSON to stdout + outputs/transform-<timestamp>.json
node src/cli/index.js --sample

# Human-readable views (only when requested)
node src/cli/index.js --sample --color            # old colorful summary view (pre-JSON default)
node src/cli/index.js --sample --format summary
node src/cli/index.js --sample --format table
node src/cli/index.js --sample --format conflicts

# Custom config (by name in configs/ or by file path)
node src/cli/index.js --sample --config hiring-manager
node src/cli/index.js --sample --config ./my-config.json

# Process specific files or a directory
node src/cli/index.js --files sample-data/structured/recruiters.csv
node src/cli/index.js --inputs ./data --out result.json

# Write to a specific file (and skip the auto-save folder)
node src/cli/index.js --sample --out result.json --no-save

# Disable enrichment (fully offline, deterministic)
node src/cli/index.js --sample --no-enrich

# Utilities
node src/cli/index.js validate ./my-config.json   # Validate a custom config
node src/cli/index.js configs                      # List available configs
node src/cli/index.js formats                      # List supported input formats
```

### Utility Commands

Besides `transform` (the default command), the CLI ships three helper commands:

| Command | Usage | Description |
|---------|-------|-------------|
| `validate <config>` | `node src/cli/index.js validate ./my-config.json` | Validate a custom output config by path or by name in `configs/`. Prints errors/warnings and exits with code `1` if invalid (CI-friendly). Uses the same validator as `POST /api/configs/validate`. |
| `configs` | `node src/cli/index.js configs` | List every output config available in `configs/`, showing each config's name and the fields it projects. |
| `formats` | `node src/cli/index.js formats` | List the supported input file formats (`.csv`, `.json`, `.txt`, `.pdf`, `.docx`) and note that GitHub/LinkedIn URLs found in any source are auto-enriched. |

#### Example output

```text
$ node src/cli/index.js configs

Available output configs ──────────────────────────────────
  custom-recruiter — id, name, primary_email, primary_phone, country, city, title, yoe, top_skills
  default          — candidate_id, full_name, emails, phones, location, headline, years_experience, skills, links, experience, education
  hiring-manager   — candidate_id, name, headline, skills, experience, education

$ node src/cli/index.js formats

Supported input formats ───────────────────────────────────
  .csv  .json  .txt  .pdf  .docx
  Enrichment: GitHub & LinkedIn URLs found in any source are auto-fetched.

$ node src/cli/index.js validate configs/default.json

Validate config: configs/default.json ─────────────────────
  ✓ Config is valid.
```

If a config is invalid, `validate` prints each error (and any warnings) and exits with code `1`:

```text
$ node src/cli/index.js validate ./broken.json
  ✗ fields[0].normalize 'capitalise' is not a known normalizer
  ✗ missing_policy 'skip' must be one of: null, omit, error
```


Global flags also available everywhere:

| Flag | Description |
|------|-------------|
| `--no-color` | Disable ANSI colors (useful for logs/CI) |
| `-h`, `--help` | Show help for the CLI or a specific command |
| `-v`, `--version` | Print the package version |

### Command Options

| Option | Description |
|--------|-------------|
| `--sample` | Use bundled sample data |
| `--inputs <dir>` | Scan a directory of source files |
| `--files <a> <b> …` | Process explicit file(s) |
| `--url <link>` | Add GitHub/LinkedIn URL(s) for enrichment (repeatable) |
| `--config <name\|path>` | Output config preset (in `configs/`) or file path |
| `--enrich` / `--no-enrich` | Toggle all enrichment (default: on) |
| `--no-github` / `--no-linkedin` | Granular enrichment toggles |
| `--format <type>` | Console output: **`json` (default)**, `summary`, `table`, `conflicts` |
| `--out <file>` | Write full JSON result to a specific file |
| `--save` / `--no-save` | Auto-save JSON to `outputs/` (default: on) |
| `--pretty` / `--no-pretty` | Pretty-print JSON (default: on) |
| `--quiet` | Suppress stdout (still writes files) |
| `--color` | Show the **old colorful summary view** (pre-JSON default) instead of JSON |
| `--no-color` | Disable ANSI colors |

### Output Formats

| Format | Description |
|--------|-------------|
| **json** *(default)* | Full machine-readable output (same shape as `--out`), printed to stdout and saved to `outputs/` |
| **summary** | Stats, parse report, enrichment counts, entity-resolution merges, and readable per-candidate profiles |
| **table** | One row per candidate (name, id, email, #skills, confidence, #conflicts) |
| **conflicts** | Only cross-source conflicts (winner vs alternates per field) |

---

## 📝 Output Configuration

Define your output schema at runtime via JSON configuration:

```json
{
  "fields": [
    { "key": "id", "from": "candidate_id" },
    { "key": "name", "from": "full_name", "normalize": "name" },
    { "key": "primary_email", "from": "emails[0]", "normalize": "email" },
    { "key": "primary_phone", "from": "phones[0]", "normalize": "phone" },
    { "key": "country", "from": "location.country", "normalize": "country" },
    { "key": "top_skills", "from": "skills", "normalize": "skill" }
  ],
  "include_provenance": true,
  "include_confidence": true,
  "missing_policy": "null"
}
```

### Configuration Options

| Field | Description |
|-------|-------------|
| `fields` | Array of field mappings |
| `fields[].key` | Output field name |
| `fields[].from` | Source path (supports dotted + indexed: `emails[0]`, `location.country`) |
| `fields[].normalize` | Optional normalizer: `name`, `email`, `phone`, `date`, `country`, `skill`, `lowercase`, `uppercase` |
| `include_provenance` | Track source of each value |
| `include_confidence` | Include confidence scores |
| `missing_policy` | `null` (default), `omit`, or `error` |

Configs are validated by `src/transformer/validate-config.js`, which is shared between the CLI (`validate` command) and the `POST /api/configs/validate` endpoint.

### Bundled Configs
- `configs/default.json` — standard output with all fields
- `configs/hiring-manager.json` — manager-focused summary
- `configs/custom-recruiter.json` — recruiter-specific view

---

## 🔄 Pipeline Architecture

```
detect → extract → normalize → enrich → resolve → merge → project → validate
```

1. **Detect & Extract** — auto-detect format (CSV/JSON/TXT/PDF/DOCX) and parse with format-specific parsers.
2. **Normalize** — phone → E.164, email → lowercase, name → capitalized, date → ISO-8601, country → ISO-2, skills → lowercased + deduped.
3. **Enrich** — scan for GitHub/LinkedIn URLs and fetch public profiles (GitHub by default), adding source-tagged records.
4. **Resolve** — entity resolution via Union-Find: merge duplicates on strong/weak signals.
5. **Merge** — hybrid conflict resolution (source priority + confidence), tracking provenance and alternates.
6. **Project** — apply the runtime schema configuration and missing-value policy.
7. **Validate** — ensure output meets schema requirements; report errors/warnings.

---

## 🔍 Entity Resolution

**Strong signals (immediate merge):** shared email, phone, GitHub handle, or LinkedIn handle.
**Weak signals (merge with confidence):** same normalized name AND shared city/country.

```json
{
  "resolution": {
    "groups_before": 3,
    "groups_after": 1,
    "merges": [
      { "from": "synthetic_a", "into": "derived_linda" },
      { "from": "synthetic_b", "into": "derived_linda" }
    ]
  }
}
```

---

## ⚖️ Conflict Resolution

When sources disagree on a field:

1. **Source priority** (weighted): ATS > Recruiter CSV > Resume > Notes
2. **Confidence scores** (0–1) from extraction quality
3. **Tie-break**: alphabetical order of the value's JSON string

```json
{
  "id": "cand_001",
  "full_name": "Rohan Mehta",
  "conflicts": {
    "years_experience": {
      "winner": 10,
      "winning_sources": ["ats_json"],
      "alternates": [
        { "value": 8, "sources": ["recruiter_csv"], "weight": 0.765 },
        { "value": 9, "sources": ["resume"], "weight": 0.560 }
      ]
    }
  }
}
```

---

## 📄 Input Formats

| Format | Parser | Notes |
|--------|--------|-------|
| **CSV** | `csv-parse` | Flexible column mapping, email-derived ID fallback |
| **JSON** | Native | Array or `{candidates:[…]}` structure |
| **TXT (Resume)** | Regex/Lexicon | Labeled sections (NAME, EMAIL, SKILLS, EXPERIENCE) |
| **TXT (Notes)** | Regex/Lexicon | `---` separated blocks, freeform extraction |
| **PDF** | `pdf-parse` | Text extraction + heading sniffing |
| **DOCX** | `mammoth` | Raw text extraction, section parsing |
| **GitHub** | REST API | Auto-enrich from URLs (set `GITHUB_TOKEN` for 5000 req/hr) |
| **LinkedIn** | API (optional) | Handle extraction; full enrichment with API key |

---

## 🌐 Web API (Express)

The Express server (`src/server.js`, port **8002**) wraps the same pipeline and powers the React UI. In this environment a FastAPI proxy forwards `/api/*` from port 8001 to this server.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/sample-data` | GET | List bundled sample files |
| `/api/sample-data/extract/*` | GET | Extract readable text from a sample file |
| `/api/sample-data/*` | GET | Fetch a raw sample file |
| `/api/configs` | GET | List available output configs |
| `/api/configs/:name` | GET | Fetch a single config |
| `/api/configs/validate` | POST | Validate a custom config |
| `/api/preview` | POST | Extract readable text from an uploaded binary file (PDF/DOCX) |
| `/api/transform` | POST | Transform with provided inputs |
| `/api/transform/sample` | POST | Transform bundled sample data |
| `/api/transform/upload` | POST | Upload and transform files (multipart, up to 20) |

### Starting the Server

```bash
yarn start      # node src/server.js
yarn dev        # same (no hot-reload — restart manually after edits)
```

> In this managed environment the server runs under supervisor. After editing files in `node-server/`, restart with: `sudo supervisorctl restart backend`.

---

## 🧪 Testing

```bash
yarn test       # runs test/run.js — 24 deterministic, offline tests
```

The test suite is **strictly offline** (live GitHub/LinkedIn calls are disabled during tests) so results are 100% deterministic and never hit rate limits.

**Coverage includes:** normalization (phone/email/name/date/country), entity resolution (duplicate detection + merge logs), conflict resolution (source priority + confidence weighting + alternates), output projection (renames, missing policies), and edge cases (garbage years → null, missing data).

---

## 🔧 Environment Variables

| Variable | Description |
|----------|-------------|
| `GITHUB_TOKEN` | GitHub API token — raises unauthenticated rate limit from 60 → 5000 req/hr |
| `LINKEDIN_API_KEY` | LinkedIn enrichment via a provider (e.g. Proxycurl) |

Without `GITHUB_TOKEN`, live enrichment is limited to 60 requests/hour and may return HTTP 403 once exhausted — this is expected for unauthenticated use.

---

## 📦 Dependencies

`express`, `cors`, `multer`, `csv-parse`, `libphonenumber-js`, `pdf-parse`, `mammoth`, `yargs`.

---

## 📝 Recent Changes

**CLI output is now JSON-first.**

- **JSON by default** — `transform` (the default command) now emits **JSON only** to stdout. The previous default was the colorful `summary` view.
- **Auto-save to `outputs/`** — every run also writes its JSON result to `outputs/transform-<timestamp>.json`. Use `--no-save` to skip, or `--out <file>` to write to a specific path.
- **`--color` restores the old view** — pass `--color` to bring back the previous human-readable summary output (stats, files, enrichment, per-candidate profiles). An explicit `--format` still wins (e.g. `--color --format table`).
- **Other formats on request** — `--format summary | table | conflicts` are produced only when asked; default stays JSON.

Quick reference:

| You run | You get |
|---------|---------|
| `node src/cli/index.js --sample` | JSON to stdout **+** saved `outputs/transform-<ts>.json` |
| `node src/cli/index.js --sample --color` | Old colorful summary view |
| `node src/cli/index.js --sample --format table` | Table view |
| `node src/cli/index.js --sample --out r.json --no-save` | JSON written only to `r.json` |

> No pipeline, parsing, or API behavior changed — these updates affect **CLI presentation and persistence only**. All 24 tests still pass.

---

**Built for smarter, deterministic candidate data processing.**
