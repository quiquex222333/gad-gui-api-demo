'use strict';
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const TOOL_ROOT = path.resolve(__dirname, '..');
const BIN = path.join(TOOL_ROOT, 'bin', 'coverage.js');
const FIX = path.join(__dirname, 'fixtures');
const REPO_ROOT = path.resolve(TOOL_ROOT, '..');

function run(args, opts = {}) {
  const r = spawnSync(process.execPath, [BIN, ...args], {
    encoding: 'utf8',
    cwd: opts.cwd || TOOL_ROOT,
    env: { ...process.env, ...(opts.env || {}) },
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

const miniArgs = (outDir) => [
  'report',
  '--spec', path.join(FIX, 'mini-openapi.json'),
  '--requests', path.join(FIX, 'requests-mini.jsonl'),
  '--config', path.join(FIX, 'mini.config.json'),
  '--waivers', path.join(FIX, 'mini.waivers.json'),
  '--out-dir', outDir,
];

// Minimal JSON-Schema (draft 2020-12 subset) validator, enough for report.schema.json.
// Returns an array of error strings (empty = valid).
function validateSchema(root, data) {
  const errors = [];
  const resolve = (ref) => ref.replace(/^#\//, '').split('/').reduce((o, k) => o[k], root);
  const typeOk = (t, v) =>
    t === 'null' ? v === null
    : t === 'array' ? Array.isArray(v)
    : t === 'object' ? v !== null && typeof v === 'object' && !Array.isArray(v)
    : t === 'integer' ? Number.isInteger(v)
    : t === 'number' ? typeof v === 'number'
    : typeof v === t;
  function check(schema, v, at) {
    if (schema.$ref) return check(resolve(schema.$ref), v, at);
    if ('const' in schema && v !== schema.const) errors.push(`${at}: expected const ${schema.const}`);
    if (schema.enum && !schema.enum.includes(v)) errors.push(`${at}: not in enum`);
    if (schema.type) {
      const types = Array.isArray(schema.type) ? schema.type : [schema.type];
      if (!types.some((t) => typeOk(t, v))) { errors.push(`${at}: wrong type`); return; }
    }
    if (schema.oneOf) {
      const n = schema.oneOf.filter((s) => { const save = errors.length; check(s, v, at); const ok = errors.length === save; errors.length = save; return ok; }).length;
      if (n !== 1) errors.push(`${at}: oneOf matched ${n}`);
    }
    if (typeof v === 'number') {
      if (schema.minimum !== undefined && v < schema.minimum) errors.push(`${at}: < minimum`);
      if (schema.maximum !== undefined && v > schema.maximum) errors.push(`${at}: > maximum`);
    }
    if (typeof v === 'string' && schema.pattern && !new RegExp(schema.pattern).test(v)) errors.push(`${at}: pattern`);
    if (Array.isArray(v) && schema.items) v.forEach((x, i) => check(schema.items, x, `${at}[${i}]`));
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      for (const r of schema.required || []) if (!(r in v)) errors.push(`${at}: missing "${r}"`);
      const props = schema.properties || {};
      for (const k of Object.keys(v)) {
        if (props[k]) check(props[k], v[k], `${at}.${k}`);
        else if (schema.additionalProperties === false) errors.push(`${at}: unexpected key "${k}"`);
      }
    }
  }
  check(root, data, '$');
  return errors;
}

module.exports = { run, tmpDir, miniArgs, validateSchema, TOOL_ROOT, BIN, FIX, REPO_ROOT };
