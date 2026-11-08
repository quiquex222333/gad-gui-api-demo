'use strict';
const fs = require('node:fs');
const { InputError, sha256 } = require('./config');

function normalisePath(p) {
  return p.length > 1 && p.endsWith('/') ? p.replace(/\/+$/, '') || '/' : p;
}

function names(v) {
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
}

// Pure: classify the lines of a JSONL text (spec §4.1, R4).
// Returns { counts: {total, invalid, nonTest, nullStatus}, records: [...], warnings: [...] }.
// `excluded`, `counted`, `unmatched` are computed later by analyze.
function parseRequests(text) {
  const counts = { total: 0, invalid: 0, nonTest: 0, nullStatus: 0 };
  const records = [];
  const warnings = [];
  const invalid = (n, msg) => {
    counts.invalid++;
    warnings.push({ code: 'INVALID_LINE', message: `line ${n}: ${msg}` });
  };
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].replace(/\r$/, '');
    if (raw.trim() === '') continue;
    counts.total++;
    const n = i + 1;
    let obj;
    try {
      obj = JSON.parse(raw);
    } catch (e) {
      // fixed text: engine error messages differ between Node versions (determinism)
      invalid(n, 'invalid JSON');
      continue;
    }
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
      invalid(n, 'not a JSON object');
      continue;
    }
    if (obj.source !== 'test') {
      counts.nonTest++;
      continue;
    }
    if (typeof obj.method !== 'string' || typeof obj.actualPath !== 'string') {
      invalid(n, 'missing method or actualPath');
      continue;
    }
    if (obj.status === null) {
      counts.nullStatus++;
      continue;
    }
    if (!Number.isInteger(obj.status)) {
      invalid(n, 'status is not an integer');
      continue;
    }
    records.push({
      method: obj.method.toUpperCase(),
      actualPath: normalisePath(obj.actualPath),
      status: obj.status,
      queryParams: names(obj.queryParams),
      bodyFields: names(obj.bodyFields),
      recorderTemplate: typeof obj.pathTemplate === 'string' ? obj.pathTemplate : null,
    });
  }
  return { counts, records, warnings };
}

function loadRequests(file) {
  let buf;
  try {
    buf = fs.readFileSync(file);
  } catch (e) {
    throw new InputError(`Cannot read requests file ${file}: ${e.message}`);
  }
  return { sha256: sha256(buf), ...parseRequests(buf.toString('utf8')) };
}

module.exports = { parseRequests, loadRequests, normalisePath };
