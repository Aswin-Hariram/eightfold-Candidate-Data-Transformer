/**
 * GitHub public API source. Free, no auth needed (60 req/hr per IP).
 *
 * Triggered automatically by the pipeline when a github.com URL is detected
 * in any other source. Fetches:
 *   - /users/:login              → name, bio, location, blog, company, public_repos
 *   - /users/:login/repos?per_page=30&sort=updated  → top languages, latest repo names
 *
 * Becomes a normal source record with source='github' and confidence 0.75.
 */
const norm = require('../transformer/normalize');

const GITHUB_HOST_RE = /^https?:\/\/(?:www\.)?github\.com\/([^/?#]+)(?:[/?#]|$)/i;
const HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{0,38})$/i;
const RESERVED = new Set(['settings', 'login', 'orgs', 'topics', 'trending', 'marketplace', 'about', 'pricing', 'features', 'enterprise']);

function extractHandle(url) {
  if (!url) return null;
  const m = String(url).match(GITHUB_HOST_RE);
  if (!m) return null;
  const handle = m[1];
  if (!HANDLE_RE.test(handle) || RESERVED.has(handle.toLowerCase())) return null;
  return handle;
}

async function fetchGithubProfile(handle, { fetch = global.fetch, token = process.env.GITHUB_TOKEN } = {}) {
  const headers = { 'User-Agent': 'candidate-transformer', Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const profileRes = await fetch(`https://api.github.com/users/${handle}`, { headers });
  if (!profileRes.ok) {
    const err = new Error(`GitHub /users/${handle} → ${profileRes.status}`);
    err.status = profileRes.status;
    throw err;
  }
  const profile = await profileRes.json();

  const reposRes = await fetch(`https://api.github.com/users/${handle}/repos?per_page=30&sort=updated`, { headers });
  const repos = reposRes.ok ? await reposRes.json() : [];

  const langCounts = {};
  for (const r of repos) {
    if (r.fork) continue;
    if (r.language) langCounts[r.language] = (langCounts[r.language] || 0) + 1;
  }
  const topLanguages = Object.entries(langCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([lang]) => norm.normalizeSkill(lang))
    .filter(Boolean);

  return { profile, repos, topLanguages };
}

async function parseGithubHandle(handle, opts = {}) {
  let result;
  try {
    result = await fetchGithubProfile(handle, opts);
  } catch (e) {
    // Return an explanatory low-confidence record so the user sees why it didn't enrich
    return [{
      source: 'github',
      candidate_id: opts.candidate_id || null,
      confidence: 0.0,
      _error: e.message,
      data: { candidate_id: opts.candidate_id || null, links: [{ url: `https://github.com/${handle}`, type: 'github' }] },
    }];
  }

  const { profile, topLanguages } = result;

  const links = [{ url: `https://github.com/${handle}`, type: 'github' }];
  if (profile.blog) {
    const u = norm.normalizeUrl(profile.blog);
    if (u) links.push({ url: u, type: norm.classifyLink(u) });
  }
  if (profile.twitter_username) {
    links.push({ url: `https://twitter.com/${profile.twitter_username}`, type: 'twitter' });
  }

  const headline = profile.bio
    ? profile.bio.replace(/\s+/g, ' ').trim().slice(0, 140)
    : (profile.company ? `Working at ${profile.company}` : null);

  return [{
    source: 'github',
    candidate_id: opts.candidate_id || null,
    confidence: 0.75,
    data: {
      candidate_id: opts.candidate_id || null,
      full_name: norm.normalizeName(profile.name),
      emails: profile.email ? [norm.normalizeEmail(profile.email)].filter(Boolean) : [],
      phones: [],
      location: norm.normalizeLocation(profile.location),
      headline,
      years_experience: null,
      skills: topLanguages,
      links,
      experience: profile.company
        ? [{ company: profile.company.replace(/^@/, ''), title: null, start_date: null, end_date: null, location: profile.location || null }]
        : [],
      education: [],
      // Metadata (not part of canonical schema, kept for UI)
      _github: {
        handle,
        public_repos: profile.public_repos,
        followers: profile.followers,
        following: profile.following,
        avatar_url: profile.avatar_url,
        html_url: profile.html_url,
      },
    },
  }];
}

module.exports = { extractHandle, parseGithubHandle, fetchGithubProfile, GITHUB_HOST_RE };
