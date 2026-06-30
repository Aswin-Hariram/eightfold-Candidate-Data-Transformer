/**
 * Entity resolution: fuzzy-merge duplicate candidates that DON'T already share
 * an explicit candidate_id.
 *
 * Strong signals (any one triggers merge):
 *   - any shared normalized email
 *   - any shared phone (E.164)
 *   - any shared github handle (extracted from links)
 *   - any shared linkedin handle (extracted from links)
 *
 * Weak signal (combined required):
 *   - normalized name match (exact OR token-set Jaccard >= 0.85)
 *   - same location.city OR same location.country (when both present)
 *   These two together count as a merge.
 *
 * Algorithm: union-find over candidate groups. Strong signals form edges
 * immediately. Weak signals only form an edge if BOTH conditions hold.
 *
 * Returns: a Map<oldCandidateId, newCandidateId> rewrite table.
 */
const { extractHandle: ghHandle } = require('../sources/github');
const { extractHandle: liHandle } = require('../sources/linkedin');

function tokensOfName(name) {
  if (!name) return [];
  return String(name).toLowerCase().split(/\s+/).filter((t) => t.length > 0);
}

function jaccard(a, b) {
  const A = new Set(a), B = new Set(b);
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

function nameMatch(a, b) {
  if (!a || !b) return false;
  const an = String(a).toLowerCase().replace(/\s+/g, ' ').trim();
  const bn = String(b).toLowerCase().replace(/\s+/g, ' ').trim();
  if (an === bn) return true;
  return jaccard(tokensOfName(an), tokensOfName(bn)) >= 0.85;
}

function locationMatch(a, b) {
  if (!a || !b) return false;
  const cityA = a.city ? a.city.toLowerCase() : null;
  const cityB = b.city ? b.city.toLowerCase() : null;
  if (cityA && cityB && cityA === cityB) return true;
  if (a.country && b.country && a.country === b.country) return true;
  return false;
}

function signalsOf(records) {
  const emails = new Set();
  const phones = new Set();
  const ghHandles = new Set();
  const liHandles = new Set();
  const names = new Set();
  const locations = [];
  for (const r of records) {
    for (const e of r.data.emails || []) if (e) emails.add(e.toLowerCase());
    for (const p of r.data.phones || []) if (p) phones.add(p);
    for (const lnk of r.data.links || []) {
      const url = typeof lnk === 'string' ? lnk : lnk?.url;
      const g = ghHandle(url); if (g) ghHandles.add(g.toLowerCase());
      const l = liHandle(url); if (l) liHandles.add(l.toLowerCase());
    }
    if (r.data.full_name) names.add(r.data.full_name);
    if (r.data.location) locations.push(r.data.location);
  }
  return { emails, phones, ghHandles, liHandles, names, locations };
}

function hasAnyOverlap(a, b) {
  for (const x of a) if (b.has(x)) return true;
  return false;
}

class UnionFind {
  constructor(items) { this.parent = new Map(items.map((x) => [x, x])); }
  find(x) {
    let p = this.parent.get(x);
    while (p !== x) { this.parent.set(x, this.parent.get(p)); x = p; p = this.parent.get(x); }
    return x;
  }
  union(a, b) {
    const ra = this.find(a), rb = this.find(b);
    if (ra === rb) return false;
    // Prefer the lexicographically smaller id as root (deterministic)
    if (ra < rb) this.parent.set(rb, ra); else this.parent.set(ra, rb);
    return true;
  }
}

function resolveCandidates(groupsByCid) {
  const ids = [...groupsByCid.keys()].sort();
  if (ids.length <= 1) return new Map(ids.map((i) => [i, i]));

  const sigs = new Map();
  for (const cid of ids) sigs.set(cid, signalsOf(groupsByCid.get(cid)));

  const uf = new UnionFind(ids);

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const A = sigs.get(ids[i]);
      const B = sigs.get(ids[j]);

      // Strong signals
      let strong =
        hasAnyOverlap(A.emails, B.emails) ||
        hasAnyOverlap(A.phones, B.phones) ||
        hasAnyOverlap(A.ghHandles, B.ghHandles) ||
        hasAnyOverlap(A.liHandles, B.liHandles);

      let weak = false;
      if (!strong) {
        let nameHit = false;
        for (const a of A.names) {
          for (const b of B.names) if (nameMatch(a, b)) { nameHit = true; break; }
          if (nameHit) break;
        }
        if (nameHit) {
          for (const la of A.locations) {
            for (const lb of B.locations) if (locationMatch(la, lb)) { weak = true; break; }
            if (weak) break;
          }
        }
      }

      if (strong || weak) uf.union(ids[i], ids[j]);
    }
  }

  const rewrite = new Map();
  for (const id of ids) rewrite.set(id, uf.find(id));
  return rewrite;
}

module.exports = { resolveCandidates, nameMatch, locationMatch };
