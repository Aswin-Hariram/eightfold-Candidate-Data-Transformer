/**
 * Runtime "project to output" stage.
 * Applies the user-supplied output config to the canonical profile.
 *
 * Config shape (see configs/default.json):
 * {
 *   "fields": [
 *     { "key": "primary_email", "from": "emails[0]" },
 *     { "key": "full_name", "from": "full_name" },
 *     { "key": "phone", "from": "phones[0]", "normalize": "phone" }
 *   ],
 *   "include_provenance": true,
 *   "include_confidence": true,
 *   "missing_policy": "null" | "omit" | "error"
 * }
 */
const norm = require('./normalize');

function getPath(obj, path) {
  // Supports "a.b", "a[0]", "a.b[2].c"
  if (!path) return undefined;
  const parts = path.split(/\.|\[(\d+)\]/).filter((p) => p !== undefined && p !== '');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    const idx = /^\d+$/.test(p) ? Number(p) : p;
    cur = cur[idx];
  }
  return cur;
}

function applyFieldNormalizer(value, kind) {
  if (value == null) return value;
  switch (kind) {
    case 'phone': return Array.isArray(value) ? value.map((v) => norm.normalizePhone(v)) : norm.normalizePhone(value);
    case 'email': return Array.isArray(value) ? value.map((v) => norm.normalizeEmail(v)) : norm.normalizeEmail(value);
    case 'name': return norm.normalizeName(value);
    case 'date': return norm.normalizeDate(value);
    case 'country': return norm.normalizeCountry(value);
    case 'skill': return Array.isArray(value) ? norm.normalizeSkills(value) : norm.normalizeSkill(value);
    case 'lowercase': return typeof value === 'string' ? value.toLowerCase() : value;
    case 'uppercase': return typeof value === 'string' ? value.toUpperCase() : value;
    default: return value;
  }
}

function handleMissing(policy, key) {
  if (policy === 'omit') return { __omit: true };
  if (policy === 'error') throw new Error(`Missing required field for output: ${key}`);
  return null;
}

function projectProfile(canonical, config) {
  const cfg = config || {};
  const fields = Array.isArray(cfg.fields) && cfg.fields.length > 0
    ? cfg.fields
    : Object.keys(canonical)
        .filter((k) => !k.startsWith('_') && k !== 'provenance' && k !== 'overall_confidence')
        .map((k) => ({ key: k, from: k }));

  const missingPolicy = cfg.missing_policy || 'null';
  const includeProv = cfg.include_provenance !== false;
  const includeConf = cfg.include_confidence !== false;

  const out = {};
  const provOut = {};
  const confOut = {};

  for (const f of fields) {
    const path = f.from || f.key;
    let value = getPath(canonical, path);
    if (f.normalize) value = applyFieldNormalizer(value, f.normalize);

    if (value === undefined || value === null || (Array.isArray(value) && value.length === 0)) {
      const fallback = handleMissing(missingPolicy, f.key);
      if (fallback && fallback.__omit) continue;
      out[f.key] = fallback;
    } else {
      out[f.key] = value;
    }

    if (includeProv) {
      const rootField = path.split(/[.[]/)[0];
      if (canonical.provenance && canonical.provenance[rootField] !== undefined) {
        provOut[f.key] = canonical.provenance[rootField];
      }
    }
    if (includeConf && canonical._field_confidence) {
      const rootField = path.split(/[.[]/)[0];
      if (canonical._field_confidence[rootField] !== undefined) {
        confOut[f.key] = canonical._field_confidence[rootField];
      }
    }
  }

  if (includeProv) out.provenance = provOut;
  if (includeConf) {
    out.field_confidence = confOut;
    out.overall_confidence = canonical.overall_confidence ?? 0;
    if (canonical._conflicts && Object.keys(canonical._conflicts).length > 0) {
      out.conflicts = canonical._conflicts;
    }
  }
  return out;
}

function validateAgainstConfig(output, config) {
  // Very light validation: ensure all declared keys appear (unless omitted by missing_policy)
  if (!config || !Array.isArray(config.fields)) return { ok: true, errors: [] };
  const errors = [];
  const policy = config.missing_policy || 'null';
  for (const f of config.fields) {
    if (!(f.key in output) && policy !== 'omit') {
      errors.push(`Field '${f.key}' missing from output`);
    }
  }
  return { ok: errors.length === 0, errors };
}

module.exports = { projectProfile, validateAgainstConfig, getPath };
