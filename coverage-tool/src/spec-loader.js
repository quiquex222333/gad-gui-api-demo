'use strict';
const fs = require('node:fs');
const SwaggerParser = require('@apidevtools/swagger-parser');
const { InputError, sha256 } = require('./config');
const { compareCanonical } = require('./sort');

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];
const STATUS_RE = /^[1-5][0-9]{2}$/;

// Collect top-level property names (+ required names) of a schema, merging allOf/oneOf/anyOf.
function collectBodyProps(schema, props, required, seen = new Set()) {
  if (!schema || typeof schema !== 'object' || seen.has(schema)) return;
  seen.add(schema);
  if (schema.properties && typeof schema.properties === 'object') {
    for (const name of Object.keys(schema.properties)) props.add(name);
  }
  if (Array.isArray(schema.required)) for (const r of schema.required) required.add(r);
  for (const key of ['allOf', 'oneOf', 'anyOf']) {
    if (Array.isArray(schema[key])) for (const sub of schema[key]) collectBodyProps(sub, props, required, seen);
  }
}

function extractOperation(path, method, pathItem, op, warnings) {
  const m = method.toUpperCase();
  const statuses = new Set();
  for (const key of Object.keys(op.responses || {})) {
    if (STATUS_RE.test(key)) statuses.add(Number(key));
    else warnings.push({ code: 'NON_NUMERIC_RESPONSE_KEY', message: `${m} ${path}: response key "${key}" ignored` });
  }

  // path-level then operation-level (operation overrides on same in+name)
  const byKey = new Map();
  for (const list of [pathItem.parameters, op.parameters]) {
    if (!Array.isArray(list)) continue;
    for (const p of list) {
      if (!p || (p.in !== 'path' && p.in !== 'query')) continue;
      byKey.set(`${p.in}\u0000${p.name}`, {
        in: p.in,
        name: p.name,
        required: p.in === 'path' ? true : p.required === true,
      });
    }
  }
  const params = [...byKey.values()];

  const content = op.requestBody && op.requestBody.content;
  if (content && typeof content === 'object') {
    const props = new Set();
    const required = new Set();
    for (const ct of Object.keys(content)) collectBodyProps(content[ct] && content[ct].schema, props, required);
    for (const name of props) params.push({ in: 'body', name, required: required.has(name) });
  }
  params.sort(compareCanonical);
  return { id: `${m} ${path}`, method: m, path, statuses, params };
}

async function loadSpec(file) {
  let buf;
  try {
    buf = fs.readFileSync(file);
  } catch (e) {
    throw new InputError(`Cannot read spec ${file}: ${e.message}`);
  }
  let api;
  try {
    const raw = JSON.parse(buf.toString('utf8'));
    api = await SwaggerParser.dereference(raw, { resolve: { external: false }, dereference: { circular: 'ignore' } });
  } catch (e) {
    throw new InputError(`Cannot parse spec ${file}: ${e.message}`);
  }
  const warnings = [];
  const operations = [];
  for (const p of Object.keys(api.paths || {})) {
    const item = api.paths[p] || {};
    for (const method of METHODS) {
      if (item[method] && typeof item[method] === 'object') {
        operations.push(extractOperation(p, method, item, item[method], warnings));
      }
    }
  }
  operations.sort(compareCanonical);
  return {
    sha256: sha256(buf),
    openapi: String(api.openapi || api.swagger || ''),
    infoVersion: String((api.info && api.info.version) || ''),
    operations,
    warnings,
  };
}

module.exports = { loadSpec, extractOperation };
