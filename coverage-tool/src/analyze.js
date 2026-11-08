'use strict';
const { compileGlobs, matchesAny } = require('./glob');
const { createMatcher } = require('./matcher');
const { compareCanonical, cmpStr, cmpNum, METHOD_RANK } = require('./sort');

const SCHEMA_VERSION = '1.0.0';

function round2(x) {
  return Math.round(x * 100) / 100;
}

function metric(covered, total) {
  return { covered, total, percent: total === 0 ? null : Math.round((covered * 10000) / total) / 100 };
}

function inc(map, key, by = 1) {
  map.set(key, (map.get(key) || 0) + by);
}

function compareUnmatched(a, b) {
  return (
    cmpStr(a.actualPath, b.actualPath) ||
    cmpNum(METHOD_RANK[a.method] === undefined ? 99 : METHOD_RANK[a.method], METHOD_RANK[b.method] === undefined ? 99 : METHOD_RANK[b.method]) ||
    cmpStr(a.method, b.method)
  );
}

class WarningBag {
  constructor() {
    this.map = new Map();
  }
  add(code, message, count = 1) {
    const key = code + '\u0000' + message;
    const cur = this.map.get(key);
    if (cur) cur.count += count;
    else this.map.set(key, { code, message, count });
  }
  toArray() {
    return [...this.map.values()]
      .sort((a, b) => cmpStr(a.code, b.code) || cmpStr(a.message, b.message))
      .map((w) => ({ code: w.code, message: w.message, count: w.count }));
  }
}

// Pure: (spec model, parsed requests, config, meta) -> report object (spec §10).
// meta: { toolVersion, specPath, requestsPath, configPath|null }
// waivers: validated list from waivers.js (default none). RAW summary is unaffected; summary.effective
// drops waived items from numerator and denominator.
function analyze(spec, requests, config, meta, waivers = []) {
  const warnings = new WarningBag();
  for (const w of spec.warnings || []) warnings.add(w.code, w.message);
  for (const w of requests.warnings || []) warnings.add(w.code, w.message);

  const excludeRe = compileGlobs(config.exclude);
  const scopeRe = compileGlobs(config.scope);
  const isExcluded = (p) => matchesAny(excludeRe, p);
  const isScope = (p) => matchesAny(scopeRe, p);

  const keptOps = spec.operations.filter((op) => !isExcluded(op.path));
  const state = new Map();
  for (const op of keptOps) {
    state.set(op.id, { op, requests: 0, statuses: new Map(), params: new Map() });
  }
  // Paths of excluded operations still take part in matching so that excluded traffic is
  // recognised (and dropped) rather than reported as drift.
  const fullMatcher = createMatcher(spec.operations.map((o) => o.path));
  const opsByPath = new Map();
  for (const op of spec.operations) {
    if (!opsByPath.has(op.path)) opsByPath.set(op.path, new Set());
    opsByPath.get(op.path).add(op.method);
  }

  const lines = { ...requests.counts, excluded: 0, counted: 0, unmatched: 0 };
  const unmatched = new Map();
  const driftStatuses = new Map();
  const driftParams = new Map();

  for (const r of requests.records) {
    const m = fullMatcher.matchPath(r.actualPath);
    const methods = m ? opsByPath.get(m.path) : null;
    const hasOp = !!(m && methods.has(r.method));

    // exclude applies to the derived path for matched requests, to actualPath otherwise
    const pathForExclude = hasOp ? m.path : r.actualPath;
    if (isExcluded(pathForExclude)) {
      lines.excluded++;
      continue;
    }
    lines.counted++;

    if (m && m.ambiguous) {
      warnings.add('AMBIGUOUS_TEMPLATE', `${r.actualPath}: matches ${m.ambiguous.join(', ')}; chose "${m.path}"`);
    }
    if (m && r.recorderTemplate !== null && r.recorderTemplate !== m.path) {
      warnings.add(
        'PATH_TEMPLATE_MISMATCH',
        `${r.method} ${r.actualPath}: recorder "${r.recorderTemplate}" != derived "${m.path}"`,
      );
    }

    if (!hasOp) {
      lines.unmatched++;
      const key = r.method + ' ' + r.actualPath;
      let u = unmatched.get(key);
      if (!u) {
        u = {
          method: r.method,
          actualPath: r.actualPath,
          reason: m ? 'no-method' : 'no-path',
          matchedPath: m ? m.path : null,
          inScope: isScope(r.actualPath),
          requests: 0,
          statuses: new Set(),
        };
        unmatched.set(key, u);
      }
      u.requests++;
      u.statuses.add(r.status);
      continue;
    }

    const st = state.get(`${r.method} ${m.path}`);
    const op = st.op;
    st.requests++;
    inc(st.statuses, r.status);
    const documentedStatus = op.statuses.has(r.status);
    if (!documentedStatus) inc(driftStatuses, `${op.id}#${r.status}`);

    const documented = new Set(op.params.map((p) => `${p.in}\u0000${p.name}`));
    for (const [kind, list] of [['query', r.queryParams], ['body', r.bodyFields]]) {
      for (const name of new Set(list)) {
        const key = `${kind}\u0000${name}`;
        inc(st.params, key);
        if (!documented.has(key)) inc(driftParams, `${op.id}\u0000${kind}\u0000${name}`);
      }
    }
  }

  // ---- operations ----
  const operations = [];
  for (const op of keptOps) {
    const st = state.get(op.id);
    const statuses = new Set(op.statuses);
    for (const s of st.statuses.keys()) statuses.add(s);
    const statusItems = [...statuses]
      .sort((a, b) => a - b)
      .map((status) => ({ status, documented: op.statuses.has(status), requests: st.statuses.get(status) || 0 }));

    const params = op.params.map((p) => ({
      in: p.in,
      name: p.name,
      documented: true,
      required: p.required,
      requests: p.in === 'path' ? st.requests : st.params.get(`${p.in}\u0000${p.name}`) || 0,
    }));
    const have = new Set(op.params.map((p) => `${p.in}\u0000${p.name}`));
    for (const [key, requestsN] of st.params) {
      if (have.has(key)) continue;
      const [kind, name] = key.split('\u0000');
      params.push({ in: kind, name, documented: false, required: false, requests: requestsN });
    }
    params.sort(compareCanonical);

    operations.push({
      id: op.id,
      method: op.method,
      path: op.path,
      inScope: isScope(op.path),
      covered: st.requests > 0,
      requests: st.requests,
      statuses: statusItems,
      parameters: params,
    });
  }
  operations.sort(compareCanonical);

  // ---- waivers ----
  // Ids of every documented item (operation, status, param), as in gaps.json.
  const itemState = new Map();
  for (const o of operations) {
    itemState.set(o.id, o.requests > 0);
    for (const s of o.statuses) if (s.documented) itemState.set(`${o.id}#${s.status}`, s.requests > 0);
    for (const p of o.parameters) if (p.documented) itemState.set(`${o.id}?${p.in}.${p.name}`, p.requests > 0);
  }
  const waived = new Set();
  const waiverList = [];
  for (const w of waivers) {
    if (!itemState.has(w.id)) {
      warnings.add('WAIVER_UNKNOWN_ID', `waiver "${w.id}" matches no documented item in the spec (stale?)`);
      continue;
    }
    waived.add(w.id);
    const covered = itemState.get(w.id);
    if (covered) warnings.add('WAIVER_COVERED', `waiver "${w.id}" is already covered; it is no longer needed`);
    waiverList.push({ id: w.id, kind: w.kind, reason: w.reason, evidence: w.evidence, approvedBy: w.approvedBy, covered });
  }

  // ---- dimensions ----
  function dimensions(ops, skip) {
    let oc = 0, ot = 0, sc = 0, st = 0, pc = 0, pt = 0;
    const skipped = (id) => skip && skip.has(id);
    for (const o of ops) {
      if (!skipped(o.id)) {
        ot++;
        if (o.covered) oc++;
      }
      for (const s of o.statuses) {
        if (!s.documented || skipped(`${o.id}#${s.status}`)) continue;
        st++;
        if (s.requests > 0) sc++;
      }
      for (const p of o.parameters) {
        if (!p.documented || skipped(`${o.id}?${p.in}.${p.name}`)) continue;
        pt++;
        if (p.requests > 0) pc++;
      }
    }
    return { operations: metric(oc, ot), statuses: metric(sc, st), parameters: metric(pc, pt) };
  }

  // ---- drift ----
  const opById = new Map(keptOps.map((o) => [o.id, o]));
  const undocumentedStatuses = [...driftStatuses].map(([key, n]) => {
    const i = key.lastIndexOf('#');
    const op = opById.get(key.slice(0, i));
    return {
      id: key,
      method: op.method,
      path: op.path,
      status: Number(key.slice(i + 1)),
      inScope: isScope(op.path),
      requests: n,
    };
  });
  const undocumentedParams = [...driftParams].map(([key, n]) => {
    const [opId, kind, name] = key.split('\u0000');
    const op = opById.get(opId);
    return {
      id: `${op.method} ${op.path}?${kind}.${name}`,
      method: op.method,
      path: op.path,
      in: kind,
      param: name,
      inScope: isScope(op.path),
      requests: n,
    };
  });
  const unmatchedRequests = [...unmatched.values()]
    .map((u) => ({
      method: u.method,
      actualPath: u.actualPath,
      reason: u.reason,
      matchedPath: u.matchedPath,
      inScope: u.inScope,
      requests: u.requests,
      statuses: [...u.statuses].sort((a, b) => a - b),
    }))
    .sort(compareUnmatched);

  return {
    schemaVersion: SCHEMA_VERSION,
    tool: { name: 'gad-coverage-tool', version: meta.toolVersion },
    inputs: {
      spec: {
        path: meta.specPath,
        sha256: spec.sha256,
        openapi: spec.openapi,
        infoVersion: spec.infoVersion,
        operationsTotal: spec.operations.length,
        operationsExcluded: spec.operations.length - keptOps.length,
      },
      requests: { path: meta.requestsPath, sha256: requests.sha256, lines },
      config: {
        path: meta.configPath === undefined ? null : meta.configPath,
        sha256: config.sha256 === undefined ? null : config.sha256,
        scope: config.scope.slice(),
        exclude: config.exclude.slice(),
      },
    },
    summary: {
      scope: dimensions(operations.filter((o) => o.inScope)),
      global: dimensions(operations),
      effective: {
        scope: dimensions(operations.filter((o) => o.inScope), waived),
        global: dimensions(operations, waived),
      },
    },
    waivers: waiverList,
    operations,
    drift: {
      unmatchedRequests,
      undocumentedStatuses: undocumentedStatuses.sort(compareCanonical),
      undocumentedParams: undocumentedParams.sort(compareCanonical),
    },
    warnings: warnings.toArray(),
  };
}

module.exports = { analyze, metric, round2, SCHEMA_VERSION };
