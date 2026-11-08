'use strict';
const fs = require('node:fs');
const { InputError } = require('./config');

const KINDS = ['unreachable', 'known-bug'];
const KEYS = ['id', 'kind', 'reason', 'evidence', 'approvedBy'];

function validate(arr, file) {
  const fail = (m) => new InputError(`Invalid waivers ${file}: ${m}`);
  if (!Array.isArray(arr)) throw fail('must be an array');
  const seen = new Set();
  return arr.map((w, i) => {
    const at = `entry ${i}`;
    if (w === null || typeof w !== 'object' || Array.isArray(w)) throw fail(`${at} must be an object`);
    for (const k of Object.keys(w)) if (!KEYS.includes(k)) throw fail(`${at}: unknown key "${k}"`);
    for (const k of KEYS) {
      if (typeof w[k] !== 'string' || w[k].trim() === '') throw fail(`${at}: "${k}" must be a non-empty string`);
    }
    if (!KINDS.includes(w.kind)) throw fail(`${at}: "kind" must be one of ${KINDS.join(', ')}`);
    if (seen.has(w.id)) throw fail(`duplicate id "${w.id}"`);
    seen.add(w.id);
    return { id: w.id, kind: w.kind, reason: w.reason, evidence: w.evidence, approvedBy: w.approvedBy };
  });
}

// A missing file means "no waivers". Returns the validated list, sorted by id for determinism.
function loadWaivers(file) {
  let buf;
  try {
    buf = fs.readFileSync(file);
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw new InputError(`Cannot read waivers ${file}: ${e.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(buf.toString('utf8'));
  } catch (e) {
    throw new InputError(`Invalid waivers ${file}: ${e.message}`);
  }
  return validate(parsed, file).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

module.exports = { loadWaivers, KINDS };
