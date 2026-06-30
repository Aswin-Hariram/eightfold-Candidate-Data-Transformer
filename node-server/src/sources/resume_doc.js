/**
 * PDF / DOCX resume parser. Async — extracts text via pdf-parse / mammoth,
 * then runs best-effort free-text extraction (regex + section heading sniffing).
 *
 * Recognised heading keywords (case-insensitive, must be on their own line or
 * followed by a colon): "experience", "work experience", "professional experience",
 * "education", "skills", "summary"/"about".
 *
 * Per the assignment spec, when the text doesn't contain a CANDIDATE_ID marker we
 * derive one from the filename (e.g. "resume_acme_jane.pdf" → "uploaded_acme_jane").
 */
const fs = require('fs');
const path = require('path');
const norm = require('../transformer/normalize');

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/g;
// Fixed URL regex - more strict
const URL_RE = /(?:(?:https?|ftp):\/\/)?(?:www\.)?[a-zA-Z0-9][a-zA-Z0-9-]*(?:\.[a-zA-Z0-9][a-zA-Z0-9-]*)*\.[a-zA-Z]{2,}(?:\/[^\s]*)?/g;
const YEARS_RE = /(\d+(?:\.\d+)?)\s*\+?\s*(?:years|yrs)\b/i;

const SECTION_HEADS = {
  summary: ['summary', 'about', 'profile', 'objective'],
  skills: ['skills', 'technical skills', 'core skills'],
  experience: ['experience', 'work experience', 'professional experience', 'employment'],
  education: ['education'],
};

const SKILL_LEXICON = [
  'JavaScript', 'TypeScript', 'Python', 'Go', 'Java', 'C++', 'C#', 'Swift',
  'React', 'Node.js', 'Next.js', 'Express.js', 'Django', 'Flask', 'FastAPI',
  'AWS', 'GCP', 'Azure', 'Kubernetes', 'Docker', 'Terraform',
  'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Kafka',
  'Machine Learning', 'Deep Learning', 'NLP', 'TensorFlow', 'PyTorch', 'scikit-learn',
  'SQL', 'GraphQL', 'REST APIs', 'HTML', 'CSS', 'Git', 'Linux',
];

async function extractText(filename, buffer) {
  const ext = path.extname(String(filename).toLowerCase());
  if (ext === '.pdf') {
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    return result.text || '';
  }
  if (ext === '.docx') {
    const mammoth = require('mammoth');
    const r = await mammoth.extractRawText({ buffer });
    return r.value || '';
  }
  if (ext === '.doc') {
    // .doc (binary, pre-2007) - mammoth doesn't support it; fall back to UTF-8 best-effort
    return buffer.toString('utf8');
  }
  throw new Error(`Unsupported binary resume type: ${ext}`);
}

function deriveCandidateId(text, filename, emails) {
  // 1) Explicit CANDIDATE_ID marker beats everything (deterministic linking)
  const m = text.match(/CANDIDATE_ID:\s*(\S+)/);
  if (m) return m[1];
  // 2) First email found in the file (deterministic across CSV / PDF / DOCX uploads
  //    for the *same* candidate). Slugify the local part.
  if (Array.isArray(emails) && emails.length > 0 && emails[0]) {
    const local = String(emails[0]).split('@')[0];
    const slug = local.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (slug) return `derived_${slug}`;
  }
  // 3) Filename fallback
  const stem = path.basename(filename || 'uploaded', path.extname(filename || '')).toLowerCase();
  return `uploaded_${stem.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || Date.now()}`;
}

function sliceSection(lines, keys) {
  // Return lines between the matched heading and the next known heading.
  const allHeads = Object.values(SECTION_HEADS).flat();
  const lower = lines.map((l) => l.trim().toLowerCase().replace(/[:].*$/, '').trim());
  let start = -1;
  for (let i = 0; i < lower.length; i++) {
    if (keys.includes(lower[i])) { start = i + 1; break; }
  }
  if (start === -1) return [];
  let end = lines.length;
  for (let j = start; j < lower.length; j++) {
    if (allHeads.includes(lower[j])) { end = j; break; }
  }
  return lines.slice(start, end);
}

function extractName(textLines) {
  // Heuristic: first non-empty line that looks like a name (2-4 capitalised words, no @/digits).
  // Allow 1-letter initials like "Aswin H" or "John A."
  for (const raw of textLines.slice(0, 10)) {
    const s = raw.trim();
    if (!s) continue;
    if (/[@\d]/.test(s)) continue;
    const words = s.split(/\s+/);
    if (words.length < 2 || words.length > 5) continue;
    if (words.every((w) => /^[A-Z](?:[a-zA-Z'.-]*)\.?$/.test(w))) return s;
  }
  return null;
}

function extractHeadline(textLines) {
  for (const raw of textLines.slice(0, 15)) {
    const s = raw.trim();
    if (!s) continue;
    if (/\b(engineer|developer|manager|scientist|analyst|designer|architect|lead|director)\b/i.test(s)
        && s.length < 80) return s;
  }
  return null;
}

function extractLocation(textLines) {
  for (const raw of textLines.slice(0, 20)) {
    if (/,\s*[A-Z]{2}\b|\b(USA|US|UK|India|Canada|Germany|France|Japan|Singapore|Brazil|Mexico)\b/.test(raw)) {
      return norm.normalizeLocation(raw.trim());
    }
  }
  return null;
}

function extractExperienceEntries(sectionLines) {
  const out = [];
  // First, treat each non-empty line as a potential entry (PDFs flatten blanks).
  // If a line contains '|' separators we use pattern A, else fall back to pattern B prose form.
  const candidateLines = [];
  for (const raw of sectionLines) {
    const s = raw.trim();
    if (!s) continue;
    candidateLines.push(s);
  }
  // Pattern A: pipe-separated entries
  for (const text of candidateLines) {
    const m = text.match(/^([^|\n]+)\|([^|\n]+)\|([^|\n]+?)(?:\|([^|\n]+))?$/);
    if (m) {
      const [start, end] = m[3].split(/[-–]/).map((s) => s && s.trim());
      out.push({
        company: m[1].trim(), title: m[2].trim(),
        start_date: norm.normalizeDate(start), end_date: norm.normalizeDate(end),
        location: m[4] ? m[4].trim() : null,
      });
      continue;
    }
    // Pattern B: prose form
    const m2 = text.match(/^(.+?)\s+(?:—|-|@|at)\s+(.+?)\s*\(?\s*([A-Za-z]+\.?\s*\d{4}|\d{4}|\d{4}-\d{2})\s*[-–]\s*(present|now|current|[A-Za-z]+\.?\s*\d{4}|\d{4}|\d{4}-\d{2})\)?$/i);
    if (m2) {
      out.push({
        title: m2[1].trim(), company: m2[2].trim(),
        start_date: norm.normalizeDate(m2[3]), end_date: norm.normalizeDate(m2[4]),
        location: null,
      });
    }
  }
  return out;
}

function extractEducationEntries(sectionLines) {
  const out = [];
  for (const raw of sectionLines) {
    const s = raw.replace(/\s+/g, ' ').trim();
    if (!s) continue;
    // "Institution | Degree | Year" or "Institution, Degree, Year"
    let parts = s.split('|').map((p) => p.trim());
    if (parts.length < 2) parts = s.split(/,\s*/).map((p) => p.trim());
    if (parts.length >= 2) {
      out.push({
        institution: parts[0] || null,
        degree: parts[1] || null,
        field: null,
        graduation_date: norm.normalizeDate(parts[2]) || null,
      });
    }
  }
  return out;
}

async function parseBinaryResume({ filename, buffer }) {
  const text = await extractText(filename, buffer);
  const lines = text.split(/\r?\n/);

  const emails = [...new Set(text.match(EMAIL_RE) || [])].map(norm.normalizeEmail).filter(Boolean);
  const phones = [...new Set(text.match(PHONE_RE) || [])].map((p) => norm.normalizePhone(p)).filter(Boolean);
  const urls = [...new Set(text.match(URL_RE) || [])]
    .filter(url => {
      // Exclude email addresses, file extensions, and common false positives
      const lower = url.toLowerCase();
      if (lower.includes('@') ||
          lower.includes('gmail.com') ||
          lower.includes('yahoo.com') ||
          lower.includes('outlook.com') ||
          /\.(js|e|pdf|doc|docx|txt|jpg|png|gif|css|html|xml|json|exe|dll|so|dylib|zip|tar|gz)$/.test(lower)) {
        return false;
      }
      // Must have at least one dot and be at least 5 characters long
      return url.includes('.') && url.length >= 5;
    })
    .map((u) => {
      const n = norm.normalizeUrl(u);
      return n ? { url: n, type: norm.classifyLink(n) } : null;
    })
    .filter(Boolean);

  const candidate_id = deriveCandidateId(text, filename, emails);

  const ym = text.match(YEARS_RE);
  const years_experience = ym ? Number(ym[1]) : null;

  const skillsSect = sliceSection(lines, SECTION_HEADS.skills);
  let skills = skillsSect.join('\n').split(/[,•\n;|]/)
    .map((s) => norm.normalizeSkill(s)).filter(Boolean);
  if (skills.length === 0) {
    // Fallback: lexicon match against full text
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    skills = SKILL_LEXICON.filter((s) =>
      new RegExp(`(?:^|[^A-Za-z])${esc(s)}(?:[^A-Za-z]|$)`, 'i').test(text)
    );
  }

  const experience = extractExperienceEntries(sliceSection(lines, SECTION_HEADS.experience));
  const education = extractEducationEntries(sliceSection(lines, SECTION_HEADS.education));

  return [{
    source: 'resume',
    candidate_id,
    confidence: 0.7, // slightly lower than TXT resumes - more parsing risk
    data: {
      candidate_id,
      full_name: norm.normalizeName(extractName(lines)),
      emails,
      phones,
      location: extractLocation(lines),
      headline: extractHeadline(lines),
      years_experience,
      skills,
      links: urls,
      experience,
      education,
    },
  }];
}

async function parseBinaryResumeFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  return parseBinaryResume({ filename: path.basename(filePath), buffer });
}

module.exports = { parseBinaryResume, parseBinaryResumeFile, extractText };
