# Candidate Data Transformer — Web UI Guide (optional)

The web UI is an **optional** React visualizer for the Candidate Data Transformer. The CLI in
`../node-server/` is the primary interface; this UI calls the same pipeline through a thin
Express API and exists to make demos, debugging, and config authoring pleasant.

---

## Run it

The app is supervisor-managed in this environment (hot-reload enabled). Manual dev run:

```bash
cd frontend
yarn install
yarn start          # http://localhost:3000
```

It reads the backend base URL from `frontend/.env` → `REACT_APP_BACKEND_URL`, and calls it as
`${REACT_APP_BACKEND_URL}/api/...`. (The Express/Node server is proxied behind `/api`.)

Stack: **React 19 + Tailwind CSS + lucide-react icons + axios**.

---

## Layout

A two-column workspace:

- **Left — Inputs**
  - **Bundled sample** tab: click any file to **preview** it (PDF/DOCX render or extracted text).
  - **Upload + Social URLs** tab: drag-and-drop **PDF/DOCX/TXT/CSV/JSON**, and add **GitHub/LinkedIn URLs** to enrich.
  - **Output Config** editor: pick a preset, edit JSON inline, or **drag-and-drop / upload a custom config** (`.json`). Configs are validated live — errors block, warnings inform.
  - **Run** button → calls `/api/transform/sample` or `/api/transform/upload`.

- **Right — Canonical Profiles**
  - **View toggle:** `Cards | Split | JSON` (default **Split**).
  - **Raw Output panel** (the project's main deliverable): a prominent dark JSON panel with
    **Copy all / Download all**, an **"ALL DATA — Complete Output"** block, and one
    **collapsible, titled block per candidate** (`candidate_id · name`) with its own Copy/Download.
  - **Profile cards:** structured view per candidate — contact, location, links, skills,
    experience, education, GitHub stats, a **confidence bar**, a **conflicts panel**
    (winner ✓ vs struck-through alternates), and an expanded raw-JSON section.
  - **Search:** filter profiles by name, id, email, skills, headline, or any value in the
    output; shows a live match count and an empty state.
  - **Maximize:** full-screen split modal — raw JSON (left) vs structured profile (right) with per-modal zoom.
  - **Stats bar:** records → candidates, files, orphans, +N GitHub / +N LinkedIn enrichments,
    and a banner when duplicates were fuzzy-merged.

---

## Key behaviors

| Feature | How it works |
|---------|--------------|
| File preview | PDF renders in an `<iframe>`; DOCX is text-extracted server-side (`mammoth`); TXT/CSV/JSON shown inline. |
| Config upload | Dropped/selected `.json` becomes a selectable preset and is validated via `POST /api/configs/validate`. |
| Raw output folding | Each raw block (incl. per-candidate) is collapsible; panel header has Expand all / Collapse all. |
| Zoom | The JSON font size control applies across raw views and the maximize modal. |
| Download | Download the complete output or any single candidate as `.json`. |

---

## `data-testid` reference (for automated testing)

`run-pipeline-btn`, `view-toggle`, `view-cards` / `view-split` / `view-json`,
`raw-output-panel`, `raw-block-all` (+ `-copy` / `-download`), `raw-block-<id>`,
`raw-copy-btn`, `raw-download-btn`, `profiles-grid`, `profile-card-<id>`,
`profile-json-<id>`, `card-copy-<id>` / `card-download-<id>`,
`profile-filter-input`, `config-upload-btn`, `config-upload-input`, `config-dropzone`,
`config-editor-textarea`, `config-warnings`, `config-error`,
`file-preview-body`, `file-preview-content`, `preview-close-btn`.

---

## Source

Everything lives in `src/App.js` (components: `RawOutputPanel`, `RawBlock`, `ProfileCard`,
`ConfigEditor`, `FileUploader`, `UrlsInput`, `FilePreviewModal`, `MaximizedProfile`, `Modal`).
Styling is Tailwind via `src/index.css`.
