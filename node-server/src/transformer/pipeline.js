/**
 * Orchestrates the full pipeline:
 *   detect -> extract -> normalize -> enrich (GitHub/LinkedIn) -> merge -> project
 */
const path = require('path');
const fs = require('fs');
const { parseCSV, parseCSVFile } = require('../sources/csv');
const { parseATS, parseATSFile } = require('../sources/json');
const { parseResume, parseResumeFile } = require('../sources/resume');
const { parseNotes, parseNotesFile } = require('../sources/notes');
const { parseBinaryResume, parseBinaryResumeFile } = require('../sources/resume_doc');
const { extractHandle: ghHandle, parseGithubHandle } = require('../sources/github');
const { extractHandle: liHandle, parseLinkedinHandle } = require('../sources/linkedin');
const { mergeRecords } = require('./merge');
const { projectProfile, validateAgainstConfig } = require('./project');
const { resolveCandidates } = require('./resolve');

const BINARY_EXTS = new Set(['.pdf', '.docx', '.doc']);

async function classifyAndParseFile(filePath) {
  const name = path.basename(filePath).toLowerCase();
  const ext = path.extname(name);
  if (name.endsWith('.csv')) return parseCSVFile(filePath);
  if (name.endsWith('.json')) return parseATSFile(filePath);
  if (name.includes('notes')) return parseNotesFile(filePath);
  if (BINARY_EXTS.has(ext)) return parseBinaryResumeFile(filePath);
  if (name.endsWith('.txt')) return parseResumeFile(filePath);
  return [];
}

async function classifyAndParseContent(filename, content, encoding = 'utf8') {
  const name = String(filename || '').toLowerCase();
  const ext = path.extname(name);
  if (BINARY_EXTS.has(ext)) {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, encoding === 'base64' ? 'base64' : 'binary');
    return parseBinaryResume({ filename: name, buffer });
  }
  const text = Buffer.isBuffer(content) ? content.toString('utf8') : String(content);
  if (name.endsWith('.csv')) return parseCSV(text);
  if (name.endsWith('.json')) return parseATS(text);
  if (name.includes('notes')) return parseNotes(text);
  if (name.endsWith('.txt')) return parseResume(text);
  return [];
}

function discoverFiles(inputsDir) {
  const out = [];
  function walk(dir) {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else out.push(full);
    }
  }
  walk(inputsDir);
  return out;
}

function groupByCandidate(records) {
  const byId = new Map();
  for (const r of records) {
    const id = r.candidate_id || (r.data && r.data.candidate_id);
    if (!id) continue;
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(r);
  }
  return byId;
}

/**
 * For each candidate group, look at every github.com / linkedin.com link
 * already in the bag and fetch enrichment. Each enrichment is added as a new
 * record for the same candidate_id so merge() handles it identically to
 * file-based sources.
 */
async function enrichWithSocialAPIs(records, { extraUrls = [], enableGithub = true, enableLinkedin = true } = {}) {
  // Snapshot of (candidate_id, handle) pairs to enrich, with dedup
  const ghJobs = new Map(); // key=`${cid}|${handle}` → {cid, handle}
  const liJobs = new Map();

  const collect = (cid, urls) => {
    for (const linkOrObj of urls || []) {
      const u = typeof linkOrObj === 'string' ? linkOrObj : linkOrObj?.url;
      if (!u) continue;
      if (enableGithub) {
        const h = ghHandle(u);
        if (h) ghJobs.set(`${cid}|${h.toLowerCase()}`, { cid, handle: h });
      }
      if (enableLinkedin) {
        const h = liHandle(u);
        if (h) liJobs.set(`${cid}|${h.toLowerCase()}`, { cid, handle: h });
      }
    }
  };

  for (const r of records) {
    const cid = r.candidate_id || r.data?.candidate_id;
    if (!cid) continue;
    collect(cid, r.data?.links);
  }

  // Extra URLs from the API request body — these don't have a candidate yet,
  // so we fetch first and then try to merge by email later via a pass-through
  // (handled in the caller).
  const extraRecords = [];
  for (const u of extraUrls) {
    if (enableGithub) {
      const h = ghHandle(u);
      if (h) {
        const recs = await parseGithubHandle(h, { candidate_id: null });
        for (const r of recs) {
          // Derive a candidate_id from the GitHub email if present, else handle
          const email = r.data?.emails?.[0];
          const cid = email ? `derived_${email.split('@')[0].toLowerCase().replace(/[^a-z0-9]+/g, '_')}` : `derived_gh_${h.toLowerCase()}`;
          r.candidate_id = cid; r.data.candidate_id = cid;
          extraRecords.push(r);
        }
        continue;
      }
    }
    if (enableLinkedin) {
      const h = liHandle(u);
      if (h) {
        const recs = await parseLinkedinHandle(h, { candidate_id: null });
        for (const r of recs) {
          const cid = `derived_li_${h.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
          r.candidate_id = cid; r.data.candidate_id = cid;
          extraRecords.push(r);
        }
      }
    }
  }

  const enrichments = [];
  await Promise.all([...ghJobs.values()].map(async ({ cid, handle }) => {
    const recs = await parseGithubHandle(handle, { candidate_id: cid });
    enrichments.push(...recs);
  }));
  await Promise.all([...liJobs.values()].map(async ({ cid, handle }) => {
    const recs = await parseLinkedinHandle(handle, { candidate_id: cid });
    enrichments.push(...recs);
  }));

  return { enrichments, extraRecords };
}

async function runPipeline({ inputsDir, files, urls = [], config, enrich = true, enrichGithub = true, enrichLinkedin = true } = {}) {
  let allRecords = [];
  const fileSummary = [];
  const orphans = [];

  if (inputsDir) {
    for (const fp of discoverFiles(inputsDir)) {
      try {
        const recs = await classifyAndParseFile(fp);
        allRecords = allRecords.concat(recs);
        fileSummary.push({ file: path.relative(inputsDir, fp), records: recs.length, source: recs[0]?.source });
      } catch (e) {
        fileSummary.push({ file: fp, error: e.message });
      }
    }
  }

  if (Array.isArray(files)) {
    for (const f of files) {
      try {
        const recs = await classifyAndParseContent(f.name || f.filename, f.content, f.encoding);
        allRecords = allRecords.concat(recs);
        fileSummary.push({ file: f.name || f.filename, records: recs.length, source: recs[0]?.source });
      } catch (e) {
        fileSummary.push({ file: f.name, error: e.message });
      }
    }
  }

  let enrichSummary = { github: 0, linkedin: 0, failed: 0, errors: [] };
  if (enrich) {
    const { enrichments, extraRecords } = await enrichWithSocialAPIs(allRecords, { extraUrls: urls, enableGithub: enrichGithub, enableLinkedin: enrichLinkedin });
    for (const r of enrichments.concat(extraRecords)) {
      if (r.source === 'github') enrichSummary.github++;
      else if (r.source === 'linkedin') enrichSummary.linkedin++;
      if (r._error) { enrichSummary.failed++; enrichSummary.errors.push(r._error); }
      allRecords.push(r);
    }
  }

  for (const r of allRecords) {
    if (!(r.candidate_id || r.data?.candidate_id)) orphans.push(r);
  }

  // Step 1: initial grouping by explicit candidate_id
  const initialGroups = groupByCandidate(allRecords);

  // Step 2: entity resolution — fuzzy-merge duplicate candidates that share
  // strong signals (email / phone / github / linkedin) or weak signals
  // (name + location). Returns a map of old id → canonical id.
  const rewrite = resolveCandidates(initialGroups);

  // Apply rewrite: produce the final per-candidate record bag.
  const finalGroups = new Map();
  const merges = []; // [{from, to}] for explainability
  for (const [oldId, recs] of initialGroups.entries()) {
    const newId = rewrite.get(oldId) || oldId;
    if (newId !== oldId) merges.push({ from: oldId, into: newId });
    if (!finalGroups.has(newId)) finalGroups.set(newId, []);
    for (const r of recs) {
      // Update each record's candidate_id so provenance/audit shows the new home
      r.candidate_id = newId;
      if (r.data) r.data.candidate_id = newId;
      finalGroups.get(newId).push(r);
    }
  }

  const profiles = [];
  for (const [cid, recs] of finalGroups.entries()) {
    const canonical = mergeRecords(recs);
    canonical.candidate_id = cid;
    // Attach github metadata (latest non-null wins)
    const ghMeta = recs.map((r) => r.data?._github).filter(Boolean).pop();
    const liMeta = recs.map((r) => r.data?._linkedin).filter(Boolean).pop();
    if (ghMeta) canonical._github = ghMeta;
    if (liMeta) canonical._linkedin = liMeta;
    const projected = projectProfile(canonical, config);
    const valid = validateAgainstConfig(projected, config);
    profiles.push({ candidate_id: cid, canonical, output: projected, validation: valid });
  }

  profiles.sort((a, b) => a.candidate_id.localeCompare(b.candidate_id));

  return {
    profiles,
    stats: {
      total_records: allRecords.length,
      total_candidates: profiles.length,
      orphan_records: orphans.length,
      files: fileSummary,
      enrichment: enrichSummary,
      resolution: {
        groups_before: initialGroups.size,
        groups_after: finalGroups.size,
        merges,
      },
    },
  };
}

module.exports = { runPipeline, classifyAndParseFile, classifyAndParseContent };
