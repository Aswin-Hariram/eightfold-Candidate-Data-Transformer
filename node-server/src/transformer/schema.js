/**
 * Canonical profile schema definition.
 * Fields supported and what type/normalization they expect.
 */
const CANONICAL_FIELDS = {
  candidate_id: { type: 'string' },
  full_name: { type: 'string', normalize: 'name' },
  emails: { type: 'array', items: 'email' },
  phones: { type: 'array', items: 'phone' },
  location: { type: 'object', normalize: 'location' },
  links: { type: 'array', items: 'url' },
  headline: { type: 'string' },
  years_experience: { type: 'number' },
  skills: { type: 'array', items: 'skill' },
  experience: { type: 'array', items: 'experience_entry' },
  education: { type: 'array', items: 'education_entry' },
  provenance: { type: 'object' },
  overall_confidence: { type: 'number' },
};

// Source priority for conflict resolution (higher = more trusted)
const SOURCE_WEIGHTS = {
  ats_json: 1.0,
  linkedin: 0.9,
  recruiter_csv: 0.85,
  github: 0.8,
  resume: 0.7,
  recruiter_notes: 0.4,
};

const SOURCE_DEFAULT_CONFIDENCE = {
  ats_json: 0.95,
  linkedin: 0.85,
  recruiter_csv: 0.9,
  github: 0.75,
  resume: 0.8,
  recruiter_notes: 0.55,
};

module.exports = { CANONICAL_FIELDS, SOURCE_WEIGHTS, SOURCE_DEFAULT_CONFIDENCE };
