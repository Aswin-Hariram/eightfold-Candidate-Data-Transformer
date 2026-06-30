/**
 * LinkedIn source.
 *
 * IMPORTANT: LinkedIn actively blocks scraping (TOS + technical). We do NOT
 * scrape. Instead, we treat a LinkedIn URL as a piece of evidence: we extract
 * a normalised public-profile handle and surface a low-confidence record with
 * just the link + a derived "headline" guess from the slug.
 *
 * To get richer LinkedIn data, the user can plug in a paid provider
 * (Proxycurl, Bright Data, etc.) by setting the LINKEDIN_API_KEY env var and
 * filling in fetchLinkedinViaProxycurl below.
 */
const norm = require('../transformer/normalize');

const LINKEDIN_RE = /^https?:\/\/(?:www\.)?linkedin\.com\/in\/([^/?#]+)(?:[/?#]|$)/i;

function extractHandle(url) {
  if (!url) return null;
  const m = String(url).match(LINKEDIN_RE);
  return m ? m[1] : null;
}

function guessNameFromHandle(handle) {
  // "jane-doe-3a4b1c" → "Jane Doe"
  const parts = String(handle).split('-').filter((p) => /^[a-zA-Z]+$/.test(p));
  if (parts.length < 2) return null;
  return parts.slice(0, 3)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

async function fetchLinkedinViaProxycurl(handle, { fetch = global.fetch, apiKey = process.env.LINKEDIN_API_KEY } = {}) {
  // Stub — only invoked when the user explicitly configured a provider key.
  if (!apiKey) return null;
  try {
    const url = `https://nubela.co/proxycurl/api/v2/linkedin?url=https://linkedin.com/in/${handle}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  }
}

async function parseLinkedinHandle(handle, opts = {}) {
  const url = `https://linkedin.com/in/${handle}`;
  const enriched = await fetchLinkedinViaProxycurl(handle, opts);

  if (enriched) {
    return [{
      source: 'linkedin',
      candidate_id: opts.candidate_id || null,
      confidence: 0.85,
      data: {
        candidate_id: opts.candidate_id || null,
        full_name: norm.normalizeName(enriched.full_name || `${enriched.first_name || ''} ${enriched.last_name || ''}`.trim()),
        emails: [],
        phones: [],
        location: norm.normalizeLocation(enriched.city ? `${enriched.city}, ${enriched.country || ''}` : enriched.country),
        headline: enriched.headline || null,
        years_experience: null,
        skills: Array.isArray(enriched.skills) ? enriched.skills.map(norm.normalizeSkill).filter(Boolean) : [],
        links: [{ url, type: 'linkedin' }],
        experience: (enriched.experiences || []).map((e) => ({
          company: e.company || null, title: e.title || null,
          start_date: e.starts_at ? `${e.starts_at.year}-${String(e.starts_at.month || 1).padStart(2, '0')}` : null,
          end_date: e.ends_at ? `${e.ends_at.year}-${String(e.ends_at.month || 1).padStart(2, '0')}` : null,
          location: e.location || null,
        })),
        education: (enriched.education || []).map((e) => ({
          institution: e.school || null, degree: e.degree_name || null, field: e.field_of_study || null,
          graduation_date: e.ends_at ? `${e.ends_at.year}-01` : null,
        })),
      },
    }];
  }

  // No provider configured → low-confidence "I exist, here's my URL" record.
  return [{
    source: 'linkedin',
    candidate_id: opts.candidate_id || null,
    confidence: 0.35,
    _note: 'LinkedIn enrichment requires LINKEDIN_API_KEY (Proxycurl etc.). Only handle + URL captured.',
    data: {
      candidate_id: opts.candidate_id || null,
      full_name: norm.normalizeName(guessNameFromHandle(handle)),
      emails: [], phones: [],
      location: null,
      headline: null,
      years_experience: null,
      skills: [],
      links: [{ url, type: 'linkedin' }],
      experience: [], education: [],
      _linkedin: { handle, url, enriched: false },
    },
  }];
}

module.exports = { extractHandle, parseLinkedinHandle, LINKEDIN_RE };
