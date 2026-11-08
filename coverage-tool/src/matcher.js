'use strict';
const { cmpStr } = require('./sort');

function split(p) {
  return p.split('/');
}
function isParam(seg) {
  return seg.length > 2 && seg[0] === '{' && seg[seg.length - 1] === '}';
}

// Compare two matching templates: negative if a is more specific (literal wins at first difference).
function specificity(a, b) {
  for (let i = 0; i < a.segs.length; i++) {
    const pa = isParam(a.segs[i]);
    const pb = isParam(b.segs[i]);
    if (pa !== pb) return pa ? 1 : -1;
  }
  return 0;
}

function createMatcher(specPaths) {
  const byLen = new Map();
  for (const path of [...new Set(specPaths)].sort(cmpStr)) {
    const segs = split(path);
    if (!byLen.has(segs.length)) byLen.set(segs.length, []);
    byLen.get(segs.length).push({ path, segs });
  }
  const cache = new Map();

  // Returns { path, ambiguous: [paths] | null } or null when nothing matches.
  function matchPath(actualPath) {
    if (cache.has(actualPath)) return cache.get(actualPath);
    const segs = split(actualPath);
    const candidates = (byLen.get(segs.length) || []).filter((c) =>
      c.segs.every((s, i) => (isParam(s) ? segs[i].length > 0 : s === segs[i])),
    );
    let result = null;
    if (candidates.length) {
      let best = [candidates[0]];
      for (const c of candidates.slice(1)) {
        const d = specificity(c, best[0]);
        if (d < 0) best = [c];
        else if (d === 0) best.push(c);
      }
      // candidates are already in code-unit order, so best[0] is the lowest key
      result = { path: best[0].path, ambiguous: best.length > 1 ? best.map((b) => b.path) : null };
    }
    cache.set(actualPath, result);
    return result;
  }
  return { matchPath };
}

module.exports = { createMatcher, isParam };
