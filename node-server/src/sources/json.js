/**
 * ATS JSON parser. Highest-trust structured source.
 * Expects an array of candidate objects, each potentially containing rich fields.
 */
const fs = require('fs');
const norm = require('../transformer/normalize');

function parseATS(content) {
  let arr;
  try { arr = JSON.parse(content); } catch (_) { return []; }
  if (!Array.isArray(arr)) arr = [arr];

  return arr.map((c) => {
    const links = Array.isArray(c.links) ? c.links : [];
    const normLinks = links
      .map((l) => {
        const u = norm.normalizeUrl(typeof l === 'string' ? l : l.url);
        return u ? { url: u, type: norm.classifyLink(u) } : null;
      })
      .filter(Boolean);

    const exp = (c.experience || []).map((e) => ({
      company: e.company || null,
      title: e.title || null,
      start_date: norm.normalizeDate(e.start_date || e.start),
      end_date: norm.normalizeDate(e.end_date || e.end),
      location: e.location || null,
    })).filter((e) => e.company || e.title);

    const edu = (c.education || []).map((e) => ({
      institution: e.institution || e.school || null,
      degree: e.degree || null,
      field: e.field || null,
      graduation_date: norm.normalizeDate(e.graduation_date || e.end_date),
    })).filter((e) => e.institution || e.degree);

    return {
      source: 'ats_json',
      candidate_id: c.candidate_id || c.id || null,
      confidence: c.confidence ?? 0.95,
      data: {
        candidate_id: c.candidate_id || c.id || null,
        full_name: norm.normalizeName(c.full_name || c.name),
        emails: (Array.isArray(c.emails) ? c.emails : c.email ? [c.email] : [])
          .map(norm.normalizeEmail).filter(Boolean),
        phones: (Array.isArray(c.phones) ? c.phones : c.phone ? [c.phone] : [])
          .map((p) => norm.normalizePhone(p)).filter(Boolean),
        location: norm.normalizeLocation(c.location),
        headline: c.headline || c.title || null,
        years_experience: c.years_experience != null ? Number(c.years_experience) : null,
        skills: Array.isArray(c.skills) ? c.skills.map(norm.normalizeSkill).filter(Boolean) : [],
        links: normLinks,
        experience: exp,
        education: edu,
      },
    };
  });
}

function parseATSFile(path) {
  return parseATS(fs.readFileSync(path, 'utf8'));
}

module.exports = { parseATS, parseATSFile };
