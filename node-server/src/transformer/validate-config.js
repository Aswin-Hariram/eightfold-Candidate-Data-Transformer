/**
 * Structural validator for a user-supplied OUTPUT CONFIG (the canonical-profile
 * schema). Shared by the CLI and the POST /api/configs/validate endpoint so the
 * rules stay identical everywhere.
 *
 * Returns { ok, errors[], warnings[] }.
 *   - errors   → block the run (malformed config)
 *   - warnings → allowed, but the user should know (e.g. unknown `from` path)
 */
const CANONICAL_ROOTS = new Set([
  'candidate_id', 'full_name', 'emails', 'phones', 'location', 'links',
  'headline', 'years_experience', 'skills', 'experience', 'education',
  'provenance', 'overall_confidence', 'field_confidence',
]);

const NORMALIZERS = new Set([
  'phone', 'email', 'name', 'date', 'country', 'skill', 'lowercase', 'uppercase',
]);

const MISSING_POLICIES = new Set(['null', 'omit', 'error']);

function rootOf(path) {
  return String(path).split(/[.[]/)[0];
}

function validateConfig(config) {
  const errors = [];
  const warnings = [];

  if (config == null || typeof config !== 'object' || Array.isArray(config)) {
    return { ok: false, errors: ['Config must be a JSON object.'], warnings: [] };
  }

  if (config.missing_policy != null && !MISSING_POLICIES.has(config.missing_policy)) {
    errors.push(`missing_policy must be one of: ${[...MISSING_POLICIES].join(', ')} (got '${config.missing_policy}').`);
  }

  if ('fields' in config && config.fields != null) {
    if (!Array.isArray(config.fields)) {
      errors.push('`fields` must be an array.');
    } else if (config.fields.length === 0) {
      warnings.push('`fields` is empty — the full canonical profile will be emitted.');
    } else {
      const seenKeys = new Set();
      config.fields.forEach((f, i) => {
        const where = `fields[${i}]`;
        if (f == null || typeof f !== 'object' || Array.isArray(f)) {
          errors.push(`${where} must be an object like { "key": "...", "from": "..." }.`);
          return;
        }
        if (!f.key || typeof f.key !== 'string') {
          errors.push(`${where}.key is required and must be a string.`);
        } else {
          if (seenKeys.has(f.key)) errors.push(`${where}.key '${f.key}' is duplicated.`);
          seenKeys.add(f.key);
        }
        const from = f.from || f.key;
        if (from) {
          const r = rootOf(from);
          if (!CANONICAL_ROOTS.has(r)) {
            warnings.push(`${where}.from '${from}' references unknown canonical field '${r}' — its output will be null.`);
          }
        }
        if (f.normalize != null && !NORMALIZERS.has(f.normalize)) {
          errors.push(`${where}.normalize '${f.normalize}' is not a known normalizer (${[...NORMALIZERS].join(', ')}).`);
        }
      });
    }
  } else {
    warnings.push('No `fields` declared — the full canonical profile will be emitted.');
  }

  return { ok: errors.length === 0, errors, warnings };
}

module.exports = { validateConfig, CANONICAL_ROOTS, NORMALIZERS, MISSING_POLICIES };
