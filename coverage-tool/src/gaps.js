'use strict';
const { sortCanonical } = require('./sort');

// Pure: report -> gaps[] (spec §11). Only documented, non-excluded items with requests = 0.
function deriveGaps(report) {
  const gaps = [];
  for (const op of report.operations || []) {
    if (op.requests === 0) {
      gaps.push({ id: op.id, type: 'operation', inScope: op.inScope, method: op.method, path: op.path });
    }
    for (const s of op.statuses || []) {
      if (s.documented && s.requests === 0) {
        gaps.push({
          id: `${op.id}#${s.status}`,
          type: 'status',
          inScope: op.inScope,
          method: op.method,
          path: op.path,
          status: s.status,
        });
      }
    }
    for (const p of op.parameters || []) {
      if (p.documented && p.requests === 0) {
        gaps.push({
          id: `${op.id}?${p.in}.${p.name}`,
          type: 'param',
          inScope: op.inScope,
          method: op.method,
          path: op.path,
          in: p.in,
          param: p.name,
        });
      }
    }
  }
  return sortCanonical(gaps);
}

// Every documented item present in a report, id -> covered (used by diff).
function itemIndex(report) {
  const idx = new Map();
  for (const op of report.operations || []) {
    idx.set(op.id, op.requests > 0);
    for (const s of op.statuses || []) if (s.documented) idx.set(`${op.id}#${s.status}`, s.requests > 0);
    for (const p of op.parameters || []) if (p.documented) idx.set(`${op.id}?${p.in}.${p.name}`, p.requests > 0);
  }
  return idx;
}

module.exports = { deriveGaps, itemIndex };
