'use strict';
const { deriveGaps, itemIndex } = require('./gaps');
const { sortCanonical } = require('./sort');
const { InputError } = require('./config');
const { round2 } = require('./analyze');

const DIMS = ['operations', 'statuses', 'parameters'];
const NULL_METRIC = { covered: null, total: null, percent: null };

function major(v) {
  return typeof v === 'string' ? v.split('.')[0] : undefined;
}

function checkVersion(report, label) {
  if (!report || typeof report !== 'object' || major(report.schemaVersion) !== '1') {
    throw new InputError(`${label} report: unsupported schemaVersion ${JSON.stringify(report && report.schemaVersion)} (need major 1)`);
  }
}

function metricOf(group, dim) {
  const m = group && group[dim];
  return m ? { covered: m.covered, total: m.total, percent: m.percent } : { ...NULL_METRIC };
}

function delta(a, b) {
  return a === null || b === null || a === undefined || b === undefined ? null : b - a;
}

function dimDiff(baseGroup, headGroup) {
  const out = {};
  for (const dim of DIMS) {
    const base = metricOf(baseGroup, dim);
    const head = metricOf(headGroup, dim);
    out[dim] = {
      base,
      head,
      deltaCovered: delta(base.covered, head.covered),
      deltaTotal: delta(base.total, head.total),
      deltaPercent: base.percent === null || head.percent === null ? null : round2(head.percent - base.percent),
    };
  }
  return out;
}

function driftIndex(report) {
  const d = report.drift || {};
  const items = [];
  for (const u of d.unmatchedRequests || []) {
    items.push({ id: `${u.method} ${u.actualPath}`, path: u.actualPath, method: u.method, actualPath: u.actualPath });
  }
  for (const s of d.undocumentedStatuses || []) items.push({ id: s.id, path: s.path, method: s.method, type: 'status', status: s.status });
  for (const p of d.undocumentedParams || []) items.push({ id: p.id, path: p.path, method: p.method, type: 'param', in: p.in, param: p.param });
  return new Map(items.map((i) => [i.id, i]));
}

// Pure: (baseReport, headReport, meta) -> diff object (spec §13).
// meta: { basePath, baseSha256, headPath, headSha256 }
function diffReports(base, head, meta) {
  checkVersion(base, 'base');
  checkVersion(head, 'head');

  const baseGaps = deriveGaps(base);
  const headGaps = deriveGaps(head);
  const baseIdx = itemIndex(base);
  const headIdx = itemIndex(head);

  const closed = baseGaps.filter((g) => headIdx.get(g.id) === true);
  const removed = baseGaps.filter((g) => !headIdx.has(g.id));
  const opened = headGaps.filter((g) => baseIdx.get(g.id) === true);
  const added = headGaps.filter((g) => !baseIdx.has(g.id));

  const bd = driftIndex(base);
  const hd = driftIndex(head);
  const driftAdded = sortCanonical([...hd.values()].filter((i) => !bd.has(i.id))).map((i) => i.id);
  const driftRemoved = sortCanonical([...bd.values()].filter((i) => !hd.has(i.id))).map((i) => i.id);

  return {
    schemaVersion: '1.0.0',
    base: { path: meta.basePath, sha256: meta.baseSha256 },
    head: { path: meta.headPath, sha256: meta.headSha256 },
    summary: {
      scope: dimDiff(base.summary && base.summary.scope, head.summary && head.summary.scope),
      global: dimDiff(base.summary && base.summary.global, head.summary && head.summary.global),
    },
    gaps: { closed, opened, added, removed },
    drift: { added: driftAdded, removed: driftRemoved },
  };
}

module.exports = { diffReports, checkVersion };
