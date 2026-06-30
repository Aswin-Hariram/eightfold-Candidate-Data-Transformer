/**
 * Normalization utilities. Pure functions. Deterministic.
 * Unknown / unparsable inputs return null (never invented).
 */
const { parsePhoneNumberFromString } = require('libphonenumber-js');

const SKILL_ALIASES = {
  js: 'JavaScript', javascript: 'JavaScript', 'java script': 'JavaScript',
  node: 'Node.js', nodejs: 'Node.js', 'node.js': 'Node.js',
  ts: 'TypeScript', typescript: 'TypeScript',
  py: 'Python', python: 'Python', python3: 'Python',
  react: 'React', reactjs: 'React', 'react.js': 'React',
  'next.js': 'Next.js', nextjs: 'Next.js', next: 'Next.js',
  golang: 'Go', go: 'Go',
  'k8s': 'Kubernetes', kubernetes: 'Kubernetes',
  aws: 'AWS', 'amazon web services': 'AWS',
  gcp: 'GCP', 'google cloud': 'GCP', 'google cloud platform': 'GCP',
  ml: 'Machine Learning', 'machine learning': 'Machine Learning',
  dl: 'Deep Learning', 'deep learning': 'Deep Learning',
  nlp: 'NLP', 'natural language processing': 'NLP',
  sql: 'SQL', mysql: 'MySQL', postgres: 'PostgreSQL', postgresql: 'PostgreSQL',
  mongo: 'MongoDB', mongodb: 'MongoDB',
  docker: 'Docker', git: 'Git', github: 'GitHub', linux: 'Linux',
  rest: 'REST APIs', 'rest api': 'REST APIs', 'rest apis': 'REST APIs',
  graphql: 'GraphQL', html: 'HTML', css: 'CSS',
  redis: 'Redis', kafka: 'Kafka',
  java: 'Java', 'c++': 'C++', cpp: 'C++', 'c#': 'C#', csharp: 'C#',
  django: 'Django', flask: 'Flask', fastapi: 'FastAPI', express: 'Express.js',
  tensorflow: 'TensorFlow', pytorch: 'PyTorch', sklearn: 'scikit-learn',
  'scikit-learn': 'scikit-learn',
};

const COUNTRY_TO_ISO = {
  'united states': 'US', usa: 'US', 'u.s.a.': 'US', 'u.s.': 'US', america: 'US', us: 'US',
  india: 'IN', bharat: 'IN', in: 'IN',
  'united kingdom': 'GB', uk: 'GB', britain: 'GB', england: 'GB',
  canada: 'CA', ca: 'CA',
  germany: 'DE', deutschland: 'DE',
  france: 'FR',
  australia: 'AU',
  singapore: 'SG',
  brazil: 'BR',
  japan: 'JP',
  china: 'CN',
};

function normalizeEmail(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  // basic RFC-ish check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return null;
  return s;
}

function normalizePhone(raw, defaultCountry = 'US') {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  try {
    const parsed = parsePhoneNumberFromString(s, defaultCountry);
    if (parsed && parsed.isValid()) return parsed.number; // E.164
  } catch (_) { /* swallow */ }
  return null;
}

function normalizeSkill(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  // Reject anything that looks like a URL, email or has slashes/at-signs
  if (/^https?:\/\//i.test(s)) return null;
  if (/[@/]/.test(s)) return null;
  if (/\.[a-z]{2,}\b/i.test(s)) return null; // looks like a domain
  const key = s.toLowerCase().replace(/\s+/g, ' ');
  if (SKILL_ALIASES[key]) return SKILL_ALIASES[key];
  // Title-case unknown skills, preserve known acronyms (>=2 chars all caps stays)
  if (/^[A-Z0-9+#.]{2,}$/.test(s)) return s;
  return s
    .split(/\s+/)
    .map((w) => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
}

function normalizeSkills(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  const seen = new Set();
  for (const item of arr) {
    const n = normalizeSkill(item);
    if (n && !seen.has(n.toLowerCase())) {
      seen.add(n.toLowerCase());
      out.push(n);
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function normalizeDate(raw) {
  // Accepts: "Jan 2021", "January 2021", "2021-01", "2021/1", "01/2021", "2021"
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  if (s === 'present' || s === 'current' || s === 'now') return 'present';

  const months = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
    may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
    sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
    dec: 12, december: 12,
  };

  // YYYY-MM or YYYY/MM
  let m = s.match(/^(\d{4})[-/](\d{1,2})$/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}`;

  // MM/YYYY or MM-YYYY
  m = s.match(/^(\d{1,2})[-/](\d{4})$/);
  if (m) return `${m[2]}-${String(m[1]).padStart(2, '0')}`;

  // YYYY only
  m = s.match(/^(\d{4})$/);
  if (m) return `${m[1]}-01`;

  // Month YYYY
  m = s.match(/^([a-z]+)\.?\s+(\d{4})$/);
  if (m && months[m[1]]) return `${m[2]}-${String(months[m[1]]).padStart(2, '0')}`;

  return null;
}

function normalizeCountry(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  if (/^[a-z]{2}$/.test(s)) return s.toUpperCase();
  return COUNTRY_TO_ISO[s] || null;
}

function normalizeLocation(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  // Try "City, ST, Country" or "City, Country"
  const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const out = { city: null, region: null, country: null, raw: s };
  if (parts.length === 1) {
    out.city = parts[0];
  } else if (parts.length === 2) {
    out.city = parts[0];
    const c = normalizeCountry(parts[1]);
    if (c) out.country = c;
    else out.region = parts[1];
  } else {
    out.city = parts[0];
    out.region = parts[1];
    out.country = normalizeCountry(parts[parts.length - 1]);
  }
  return out;
}

function normalizeName(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().replace(/\s+/g, ' ');
  if (!s) return null;
  return s
    .split(' ')
    .map((w) => (w.length === 0 ? w : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
}

function normalizeUrl(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    // Require a real hostname with at least one dot AND a 2+ letter TLD
    if (!/\.[a-z]{2,}$/i.test(u.hostname)) return null;
    return u.origin + u.pathname.replace(/\/$/, '') + u.search;
  } catch (_) { return null; }
}

function classifyLink(url) {
  if (!url) return 'other';
  const u = url.toLowerCase();
  if (u.includes('linkedin.com')) return 'linkedin';
  if (u.includes('github.com')) return 'github';
  if (u.includes('twitter.com') || u.includes('x.com')) return 'twitter';
  if (u.includes('stackoverflow.com')) return 'stackoverflow';
  return 'other';
}

module.exports = {
  normalizeEmail,
  normalizePhone,
  normalizeSkill,
  normalizeSkills,
  normalizeDate,
  normalizeCountry,
  normalizeLocation,
  normalizeName,
  normalizeUrl,
  classifyLink,
};
