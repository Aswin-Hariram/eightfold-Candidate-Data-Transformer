/**
 * Conflict resolution & merging across sources.
 *
 * Policy (hybrid):
 *   - For SCALAR fields (full_name, headline, location, years_experience):
 *       confidence-weighted voting. The candidate value with the highest
 *       (source_weight * record_confidence) wins. Ties broken by source priority,
 *       then by alphabetical determinism.
 *   - For LIST fields (emails, phones, links, skills, experience, education):
 *       union across sources, deduped. Provenance lists all contributing sources.
 *
 * Each source record is shaped as:
 *   { source: 'ats_json'|'recruiter_csv'|'resume'|'recruiter_notes',
 *     candidate_id, confidence, data: { <canonical_field>: value, ... } }
 */
const { SOURCE_WEIGHTS, SOURCE_DEFAULT_CONFIDENCE } = require('./schema');

function pickScalar(records, field) {
  const buckets = new Map(); // value -> { weight, sources: [] }
  for (const r of records) {
    const val = r.data[field];
    if (val == null || (typeof val === 'string' && val.trim() === '')) continue;
    const key = typeof val === 'object' ? JSON.stringify(val) : String(val);
    const w = (SOURCE_WEIGHTS[r.source] || 0.3) * (r.confidence ?? 0.5);
    if (!buckets.has(key)) buckets.set(key, { weight: 0, sources: [], value: val });
    const b = buckets.get(key);
    b.weight += w;
    b.sources.push(r.source);
  }
  if (buckets.size === 0) return { value: null, sources: [], confidence: 0, alternates: [] };

  // Sort: highest weight, then by deterministic key order
  const sorted = [...buckets.values()].sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    return JSON.stringify(a.value).localeCompare(JSON.stringify(b.value));
  });
  const top = sorted[0];
  const totalWeight = sorted.reduce((s, x) => s + x.weight, 0);
  const alternates = sorted.slice(1).map((x) => ({
    value: x.value,
    sources: [...new Set(x.sources)].sort(),
    weight: Number(x.weight.toFixed(3)),
  }));
  return {
    value: top.value,
    sources: [...new Set(top.sources)].sort(),
    confidence: Number((top.weight / totalWeight).toFixed(3)),
    alternates,
  };
}

function mergeListWithProvenance(records, field, keyOf) {
  // Returns { items: [...], itemProvenance: { key -> [sources] }, confidence }
  const seen = new Map();
  for (const r of records) {
    const arr = r.data[field];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (item == null) continue;
      const k = keyOf(item);
      if (!k) continue;
      if (!seen.has(k)) seen.set(k, { value: item, sources: [], weight: 0 });
      const entry = seen.get(k);
      entry.sources.push(r.source);
      entry.weight += (SOURCE_WEIGHTS[r.source] || 0.3) * (r.confidence ?? 0.5);
    }
  }

  const items = [...seen.values()].sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    return JSON.stringify(a.value).localeCompare(JSON.stringify(b.value));
  });
  const itemProvenance = {};
  for (const e of items) itemProvenance[keyOf(e.value)] = [...new Set(e.sources)].sort();
  const overall = items.length === 0 ? 0 :
    Number((items.reduce((s, x) => s + x.weight, 0) / items.length).toFixed(3));
  return {
    items: items.map((e) => e.value),
    itemProvenance,
    confidence: Math.min(1, overall),
  };
}

function mergeRecords(records) {
  // records: array of { source, candidate_id, confidence, data }
  // Fill default confidences
  for (const r of records) {
    if (r.confidence == null) r.confidence = SOURCE_DEFAULT_CONFIDENCE[r.source] ?? 0.5;
  }

  const merged = {};
  const provenance = {};
  const fieldConfidence = {};
  const conflicts = {};

  // Scalars
  for (const field of ['full_name', 'headline', 'location', 'years_experience', 'candidate_id']) {
    const { value, sources, confidence, alternates } = pickScalar(records, field);
    merged[field] = value;
    provenance[field] = sources;
    fieldConfidence[field] = confidence;
    if (alternates && alternates.length > 0) conflicts[field] = { winner: value, winning_sources: sources, alternates };
  }

  // Lists with simple keyers
  const lists = [
    { field: 'emails', keyOf: (v) => String(v).toLowerCase() },
    { field: 'phones', keyOf: (v) => String(v) },
    { field: 'links', keyOf: (v) => String(v.url || v).toLowerCase() },
    { field: 'skills', keyOf: (v) => String(v).toLowerCase() },
    {
      field: 'experience',
      keyOf: (v) => `${(v.company || '').toLowerCase()}|${(v.title || '').toLowerCase()}|${v.start_date || ''}`,
    },
    {
      field: 'education',
      keyOf: (v) => `${(v.institution || '').toLowerCase()}|${(v.degree || '').toLowerCase()}`,
    },
  ];
  for (const l of lists) {
    const { items, itemProvenance, confidence } = mergeListWithProvenance(records, l.field, l.keyOf);
    merged[l.field] = items;
    provenance[l.field] = itemProvenance;
    fieldConfidence[l.field] = confidence;
  }

  // Overall confidence: weighted mean of present-field confidences
  const presentFields = Object.entries(fieldConfidence).filter(([, v]) => v > 0);
  const overall =
    presentFields.length === 0
      ? 0
      : Number(
          (presentFields.reduce((s, [, v]) => s + v, 0) / presentFields.length).toFixed(3)
        );

  merged.provenance = provenance;
  merged.overall_confidence = overall;
  merged._field_confidence = fieldConfidence;
  merged._conflicts = conflicts;
  return merged;
}

module.exports = { mergeRecords };
