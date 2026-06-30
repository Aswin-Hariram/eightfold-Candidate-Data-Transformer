/**
 * Recruiter Notes TXT parser. Lowest-trust unstructured source.
 *
 * Convention: each candidate block is separated by '---' line. Inside a block, the
 * very first non-empty line MUST begin with 'CANDIDATE_ID: <id>' so we can stitch
 * the freeform notes to a known candidate. The rest of the block is free text.
 * We extract emails, phones, urls via regex; skills/headline via simple keyword cues.
 */
const fs = require('fs');
const norm = require('../transformer/normalize');

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/g;
const URL_RE = /https?:\/\/[^\s)>,]+/g;

// Very small skill vocab heuristic - we look for known skill keywords in the text.
const SKILL_LEXICON = [
  'JavaScript', 'TypeScript', 'Python', 'Go', 'Java', 'React', 'Node.js', 'Next.js',
  'AWS', 'GCP', 'Kubernetes', 'Docker', 'PostgreSQL', 'MongoDB', 'Redis', 'Kafka',
  'Machine Learning', 'Deep Learning', 'NLP', 'SQL', 'GraphQL', 'TensorFlow', 'PyTorch',
  'Django', 'Flask', 'FastAPI', 'Express.js', 'REST APIs',
];

function parseNotes(content) {
  const blocks = content.split(/\n\s*---\s*\n/);
  const out = [];

  for (const blk of blocks) {
    const trimmed = blk.trim();
    if (!trimmed) continue;
    const idMatch = trimmed.match(/^CANDIDATE_ID:\s*(\S+)/m);
    if (!idMatch) continue;
    const candidate_id = idMatch[1].trim();

    const emails = [...new Set(trimmed.match(EMAIL_RE) || [])]
      .map(norm.normalizeEmail).filter(Boolean);
    const phones = [...new Set(trimmed.match(PHONE_RE) || [])]
      .map((p) => norm.normalizePhone(p)).filter(Boolean);
    const urls = [...new Set(trimmed.match(URL_RE) || [])]
      .map((u) => {
        const n = norm.normalizeUrl(u);
        return n ? { url: n, type: norm.classifyLink(n) } : null;
      }).filter(Boolean);

    const skills = SKILL_LEXICON.filter((s) => {
      const esc = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(?:^|[^A-Za-z])${esc}(?:[^A-Za-z]|$)`, 'i').test(trimmed);
    });

    // Try simple headline extraction: "Currently a <role> at <company>"
    let headline = null;
    const hm = trimmed.match(/currently\s+a[n]?\s+([A-Za-z][A-Za-z\s/]+?)\s+(?:at|@)\s+([A-Za-z][\w.\s&]+?)[\.\n]/i);
    if (hm) headline = `${hm[1].trim()} at ${hm[2].trim()}`;

    // Years experience cue: "~7 years"
    let years = null;
    const ym = trimmed.match(/(\d+(?:\.\d+)?)\s*\+?\s*(?:years|yrs)\b/i);
    if (ym) years = Number(ym[1]);

    out.push({
      source: 'recruiter_notes',
      candidate_id,
      confidence: 0.55,
      data: {
        candidate_id,
        full_name: null,
        emails,
        phones,
        location: null,
        headline,
        years_experience: years,
        skills,
        links: urls,
        experience: [],
        education: [],
      },
    });
  }
  return out;
}

function parseNotesFile(path) {
  return parseNotes(fs.readFileSync(path, 'utf8'));
}

module.exports = { parseNotes, parseNotesFile };
