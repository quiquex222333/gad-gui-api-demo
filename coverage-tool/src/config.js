'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');

const DEFAULTS = Object.freeze({
  scope: ['/articles*', '/comments*', '/users*', '/login'],
  exclude: ['/restore*', '/debug/*'],
});

class InputError extends Error {}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function validate(obj, file) {
  const fail = (m) => new InputError(`Invalid config ${file}: ${m}`);
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) throw fail('must be an object');
  for (const k of Object.keys(obj)) {
    if (k !== 'scope' && k !== 'exclude') throw fail(`unknown key "${k}"`);
  }
  const out = {};
  for (const k of ['scope', 'exclude']) {
    const v = obj[k] === undefined ? DEFAULTS[k] : obj[k];
    if (!Array.isArray(v) || !v.every((s) => typeof s === 'string')) throw fail(`"${k}" must be an array of strings`);
    out[k] = v.slice();
  }
  return out;
}

// Returns { scope, exclude, sha256, loaded }. A missing file yields defaults (sha256 null).
function loadConfig(file) {
  let buf;
  try {
    buf = fs.readFileSync(file);
  } catch (e) {
    if (e.code === 'ENOENT') return { scope: DEFAULTS.scope.slice(), exclude: DEFAULTS.exclude.slice(), sha256: null, loaded: false };
    throw new InputError(`Cannot read config ${file}: ${e.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(buf.toString('utf8'));
  } catch (e) {
    throw new InputError(`Invalid config ${file}: ${e.message}`);
  }
  return { ...validate(parsed, file), sha256: sha256(buf), loaded: true };
}

module.exports = { DEFAULTS, InputError, loadConfig, sha256 };
