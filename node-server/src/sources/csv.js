/**
 * Recruiter CSV parser.
 *
 * Accepts flexible column names. The minimum required signal is a name OR email
 * (we synthesize a deterministic `derived_<slug>` candidate_id otherwise).
 *
 * Column aliases recognised (first match wins; case-insensitive):
 *   candidate_id  : candidate_id, id, candidateid
 *   name          : name, full_name, fullname, candidate
 *   email         : email, emails, work_email, e-mail
 *   phone         : phone, phones, mobile, contact, phone_number
 *   location      : location, city, address
 *   headline      : headline, title, role, current_role, position
 *   company       : company, current_company, employer
 *   years         : years_experience, years, yoe, experience_years, experience
 *   skills        : skills, technical_skills
 *   linkedin      : linkedin, linkedin_url
 *   github        : github, github_url
 *   portfolio     : portfolio, website, personal_site
 *
 * Skills field is split on `;` `,` or `|`. If the experience column is a date
 * range like "2024-2025" we compute years; if it's numeric we coerce; otherwise null.
 */
const { parse } = require('csv-parse/sync');
const fs = require('fs');
const norm = require('../transformer/normalize');

const ALIASES = {
  candidate_id: ['candidate_id', 'id', 'candidateid'],
  name: ['name', 'full_name', 'fullname', 'candidate'],
  email: ['email', 'emails', 'work_email', 'e-mail'],
  phone: ['phone', 'phones', 'mobile', 'contact', 'phone_number'],
  location: ['location', 'city', 'address'],
  headline: ['headline', 'title', 'role', 'current_role', 'position'],
  company: ['company', 'current_company', 'employer'],
  years: ['years_experience', 'years', 'yoe', 'experience_years', 'experience'],
  skills: ['skills', 'technical_skills'],
  linkedin: ['linkedin', 'linkedin_url'],
  github: ['github', 'github_url'],
  portfolio: ['portfolio', 'website', 'personal_site'],
};

function pick(row, keys) {
  for (const k of keys) {
    for (const col of Object.keys(row)) {
      if (col && col.toLowerCase().trim() === k) {
        const v = row[col];
        if (v != null && String(v).trim() !== '') return String(v).trim();
      }
    }
  }
  return null;
}

function computeYears(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  // Plain number
  const n = Number(s);
  if (Number.isFinite(n) && n >= 0 && n < 80) return n;
  // Date range "2024-2025" or "Aug 2018 - Dec 2020"
  const m = s.match(/(\d{4}).*?(\d{4}|present|now|current)/i);
  if (m) {
    const start = Number(m[1]);
    const end = /\d{4}/.test(m[2]) ? Number(m[2]) : new Date().getFullYear();
    const y = end - start;
    if (y >= 0 && y < 80) return y;
  }
  return null;
}

function slug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function deriveCandidateId(name, email, index) {
  if (email) return `derived_${slug(email.split('@')[0])}`;
  if (name) return `derived_${slug(name)}`;
  return `derived_row_${index + 1}`;
}

function parseCSV(content) {
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    relax_quotes: true,
  });

  return records.map((row, i) => {
    const name = pick(row, ALIASES.name);
    const email = pick(row, ALIASES.email);
    const phone = pick(row, ALIASES.phone);
    const location = pick(row, ALIASES.location);
    const headline = pick(row, ALIASES.headline);
    const company = pick(row, ALIASES.company);
    const yearsRaw = pick(row, ALIASES.years);
    const skillsRaw = pick(row, ALIASES.skills);
    const linkedin = pick(row, ALIASES.linkedin);
    const github = pick(row, ALIASES.github);
    const portfolio = pick(row, ALIASES.portfolio);

    const explicitId = pick(row, ALIASES.candidate_id);
    const candidate_id = explicitId || deriveCandidateId(name, email, i);

    const skills = (skillsRaw || '')
      .split(/[,;|]/)
      .map((s) => norm.normalizeSkill(s))
      .filter(Boolean);

    const links = [];
    for (const u of [linkedin, github, portfolio]) {
      if (!u) continue;
      const n = norm.normalizeUrl(u);
      if (n) links.push({ url: n, type: norm.classifyLink(n) });
    }

    const experience = [];
    if (company || headline) {
      experience.push({
        company: company || null,
        title: headline || null,
        start_date: null,
        end_date: null,
        location: location || null,
      });
    }

    return {
      source: 'recruiter_csv',
      candidate_id,
      confidence: 0.9,
      data: {
        candidate_id,
        full_name: norm.normalizeName(name),
        emails: email ? [norm.normalizeEmail(email)].filter(Boolean) : [],
        phones: phone ? [norm.normalizePhone(phone)].filter(Boolean) : [],
        location: norm.normalizeLocation(location),
        headline: headline || null,
        years_experience: computeYears(yearsRaw),
        skills,
        links,
        experience,
        education: [],
      },
    };
  });
}

function parseCSVFile(path) {
  return parseCSV(fs.readFileSync(path, 'utf8'));
}

module.exports = { parseCSV, parseCSVFile };
