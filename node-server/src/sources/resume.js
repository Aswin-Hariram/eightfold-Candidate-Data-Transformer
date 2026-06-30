/**
 * Resume TXT parser. Best-effort extraction via labelled section headings.
 * File format convention (also matches sample resumes):
 *
 *   CANDIDATE_ID: cand_001
 *   NAME: Jane Doe
 *   EMAIL: jane@example.com
 *   PHONE: +1 555 123 4567
 *   LOCATION: San Francisco, CA, US
 *   HEADLINE: Senior Backend Engineer
 *   YEARS: 7
 *   LINKS: https://linkedin.com/in/jane, https://github.com/jane
 *
 *   SKILLS:
 *   - Python
 *   - Go
 *
 *   EXPERIENCE:
 *   - Acme | Senior Engineer | Jan 2021 - Present | SF
 *   - Globex | Engineer | Aug 2018 - Dec 2020 | NY
 *
 *   EDUCATION:
 *   - MIT | BS Computer Science | 2018
 */
const fs = require('fs');
const norm = require('../transformer/normalize');

function _line(map, key) {
  const v = map.get(key);
  return v == null ? null : v.trim();
}

function parseResume(content) {
  const lines = content.split(/\r?\n/);
  const map = new Map();
  const sections = { SKILLS: [], EXPERIENCE: [], EDUCATION: [] };

  let mode = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const sectionMatch = line.match(/^([A-Z_]+):\s*$/);
    if (sectionMatch && sections[sectionMatch[1]] !== undefined) {
      mode = sectionMatch[1];
      continue;
    }
    const kv = line.match(/^([A-Z_]+):\s*(.*)$/);
    if (kv && sections[kv[1]] === undefined) {
      mode = null;
      map.set(kv[1], kv[2]);
      continue;
    }
    if (mode && line.startsWith('-')) {
      sections[mode].push(line.replace(/^-\s*/, ''));
    }
  }

  const skills = sections.SKILLS.map(norm.normalizeSkill).filter(Boolean);
  const experience = sections.EXPERIENCE.map((row) => {
    const parts = row.split('|').map((s) => s.trim());
    if (parts.length < 3) return null;
    const datePart = parts[2] || '';
    const [start, end] = datePart.split(/[-–]/).map((s) => s && s.trim());
    return {
      company: parts[0] || null,
      title: parts[1] || null,
      start_date: norm.normalizeDate(start),
      end_date: norm.normalizeDate(end),
      location: parts[3] || null,
    };
  }).filter(Boolean);

  const education = sections.EDUCATION.map((row) => {
    const parts = row.split('|').map((s) => s.trim());
    if (parts.length < 2) return null;
    return {
      institution: parts[0] || null,
      degree: parts[1] || null,
      field: null,
      graduation_date: norm.normalizeDate(parts[2]),
    };
  }).filter(Boolean);

  const linksStr = _line(map, 'LINKS') || '';
  const links = linksStr.split(',').map((u) => {
    const url = norm.normalizeUrl(u);
    return url ? { url, type: norm.classifyLink(url) } : null;
  }).filter(Boolean);

  const emails = _line(map, 'EMAIL') ? [norm.normalizeEmail(_line(map, 'EMAIL'))].filter(Boolean) : [];

  // candidate_id derivation: explicit marker > email-derived > null (dropped as orphan)
  let candidate_id = _line(map, 'CANDIDATE_ID');
  if (!candidate_id && emails.length > 0) {
    const local = emails[0].split('@')[0].toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (local) candidate_id = `derived_${local}`;
  }

  return [{
    source: 'resume',
    candidate_id,
    confidence: 0.8,
    data: {
      candidate_id,
      full_name: norm.normalizeName(_line(map, 'NAME')),
      emails,
      phones: _line(map, 'PHONE') ? [norm.normalizePhone(_line(map, 'PHONE'))].filter(Boolean) : [],
      location: norm.normalizeLocation(_line(map, 'LOCATION')),
      headline: _line(map, 'HEADLINE'),
      years_experience: _line(map, 'YEARS') ? Number(_line(map, 'YEARS')) : null,
      skills,
      links,
      experience,
      education,
    },
  }];
}

function parseResumeFile(path) {
  return parseResume(fs.readFileSync(path, 'utf8'));
}

module.exports = { parseResume, parseResumeFile };
