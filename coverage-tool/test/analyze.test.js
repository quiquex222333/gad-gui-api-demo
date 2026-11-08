'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { loadSpec } = require('../src/spec-loader');
const { loadRequests } = require('../src/requests-loader');
const { loadConfig } = require('../src/config');
const { analyze } = require('../src/analyze');
const { deriveGaps } = require('../src/gaps');
const { FIX, REPO_ROOT } = require('./helpers');

async function mini() {
  const spec = await loadSpec(path.join(FIX, 'mini-openapi.json'));
  const requests = loadRequests(path.join(FIX, 'requests-mini.jsonl'));
  const config = loadConfig(path.join(FIX, 'mini.config.json'));
  const report = analyze(spec, requests, config, { toolVersion: 't', specPath: 's', requestsPath: 'r', configPath: 'c' });
  return { spec, report };
}
const op = (report, id) => report.operations.find((o) => o.id === id);

test('spec-loader: operations, numeric statuses, path/query/body params, headers ignored', async () => {
  const { spec } = await mini();
  assert.equal(spec.operations.length, 11);
  const post = spec.operations.find((o) => o.id === 'POST /articles');
  assert.deepEqual(post.params.map((p) => `${p.in}.${p.name}:${p.required}`), ['body.body:false', 'body.image:false', 'body.title:true']);
  assert.deepEqual([...post.statuses], [201, 422]);
  const search = spec.operations.find((o) => o.id === 'GET /articles/search');
  assert.deepEqual(search.params.map((p) => `${p.in}.${p.name}`), ['query.query'], 'header param ignored');
  const del = spec.operations.find((o) => o.id === 'DELETE /articles/{id}');
  assert.deepEqual(del.params, [{ in: 'path', name: 'id', required: true }], 'path-level param inherited');
  assert.deepEqual(spec.warnings, [{ code: 'NON_NUMERIC_RESPONSE_KEY', message: 'GET /users: response key "default" ignored' }]);
});

test('real spec: 170 operations; POST /articles body params', async () => {
  const spec = await loadSpec(path.join(REPO_ROOT, 'public/tools/schema/openapi_rest_demo.json'));
  assert.equal(spec.operations.length, 170);
  const post = spec.operations.find((o) => o.id === 'POST /articles');
  assert.deepEqual(post.params.filter((p) => p.in === 'body').map((p) => p.name), ['body', 'date', 'image', 'title']);
});

test('path param matching: /articles/7 -> {id}, /articles/search -> literal', async () => {
  const { report } = await mini();
  assert.equal(op(report, 'GET /articles/search').requests, 1);
  assert.equal(op(report, 'GET /articles/{id}').requests, 1);
  assert.equal(op(report, 'GET /surveys/statistics/{type}').requests, 1);
  assert.equal(op(report, 'GET /surveys/{surveyType}/description').requests, 0);
  const idParam = op(report, 'GET /articles/{id}').parameters.find((p) => p.in === 'path');
  assert.equal(idParam.requests, 1);
});

test('setup calls and lines without source "test" are ignored', async () => {
  const { report } = await mini();
  const L = report.inputs.requests.lines;
  assert.deepEqual(L, { total: 15, invalid: 1, nonTest: 2, nullStatus: 1, excluded: 1, counted: 10, unmatched: 2 });
  assert.equal(report.operations.some((o) => o.path.startsWith('/restore')), false, 'excluded ops absent');
});

test('drift: DELETE /articles/1 -> 404 is an undocumented status', async () => {
  const { report } = await mini();
  assert.deepEqual(report.drift.undocumentedStatuses, [
    { id: 'DELETE /articles/{id}#404', method: 'DELETE', path: '/articles/{id}', status: 404, inScope: true, requests: 1 },
  ]);
  const del = op(report, 'DELETE /articles/{id}');
  assert.deepEqual(del.statuses, [
    { status: 200, documented: true, requests: 0 },
    { status: 404, documented: false, requests: 1 },
  ]);
  assert.equal(del.covered, true);
});

test('drift: undocumented params, no-method and no-path requests', async () => {
  const { report } = await mini();
  assert.deepEqual(report.drift.undocumentedParams.map((p) => p.id), ['GET /articles?query.bogus']);
  assert.deepEqual(
    report.drift.unmatchedRequests.map((u) => `${u.method} ${u.actualPath} ${u.reason} ${u.matchedPath}`),
    ['PATCH /comments no-method /comments', 'GET /nothing/here no-path null'],
  );
});

test('recorder pathTemplate is never trusted; mismatch yields a warning', async () => {
  const { report } = await mini();
  assert.deepEqual(report.warnings.map((w) => w.code), ['INVALID_LINE', 'NON_NUMERIC_RESPONSE_KEY', 'PATH_TEMPLATE_MISMATCH']);
  assert.equal(
    report.warnings[2].message,
    'GET /articles/search: recorder "/articles/{id}" != derived "/articles/search"',
  );
});

test('drift never changes coverage totals; undocumented items are not in totals', async () => {
  const { report } = await mini();
  assert.deepEqual(report.summary.scope.operations, { covered: 5, total: 6, percent: 83.33 });
  assert.deepEqual(report.summary.global.operations, { covered: 6, total: 9, percent: 66.67 });
  assert.equal(report.inputs.spec.operationsTotal, 11);
  assert.equal(report.inputs.spec.operationsExcluded, 2);
});

test('gaps: uncovered documented items only, unique ids, canonical order', async () => {
  const { report } = await mini();
  const gaps = deriveGaps(report);
  assert.equal(new Set(gaps.map((g) => g.id)).size, gaps.length);
  const ids = gaps.map((g) => g.id);
  assert.ok(ids.includes('GET /comments'));
  assert.ok(ids.includes('GET /comments#200'));
  assert.ok(ids.includes('POST /articles#422'));
  assert.ok(ids.includes('POST /articles?body.body'));
  assert.ok(ids.includes('DELETE /articles/{id}#200'));
  assert.ok(!ids.includes('DELETE /articles/{id}#404'), 'undocumented status is not a gap');
  assert.deepEqual(Object.keys(gaps.find((g) => g.id === 'POST /articles#422')), ['id', 'type', 'inScope', 'method', 'path', 'status']);
  assert.deepEqual(Object.keys(gaps.find((g) => g.id === 'POST /articles?body.body')), ['id', 'type', 'inScope', 'method', 'path', 'in', 'param']);
});
