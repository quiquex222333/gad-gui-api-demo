'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { loadWaivers } = require('../src/waivers');
const { loadSpec } = require('../src/spec-loader');
const { loadRequests } = require('../src/requests-loader');
const { loadConfig, InputError } = require('../src/config');
const { analyze } = require('../src/analyze');
const { deriveGaps } = require('../src/gaps');
const { formatSummary } = require('../src/format-summary');
const { formatHtml } = require('../src/format-html');
const { formatReport } = require('../src/format-console');
const { run, tmpDir, miniArgs, validateSchema, TOOL_ROOT, FIX } = require('./helpers');

const W = path.join(FIX, 'mini.waivers.json');
const META = { toolVersion: 't', specPath: 's', requestsPath: 'r', configPath: 'c' };

async function build(waivers) {
  const spec = await loadSpec(path.join(FIX, 'mini-openapi.json'));
  const requests = loadRequests(path.join(FIX, 'requests-mini.jsonl'));
  const config = loadConfig(path.join(FIX, 'mini.config.json'));
  return analyze(spec, requests, config, META, waivers);
}

const entry = (over = {}) => ({ id: 'GET /x#200', kind: 'unreachable', reason: 'r', evidence: 'e', approvedBy: 'a', ...over });
function writeTmp(content) {
  const f = path.join(tmpDir('waivers-'), 'w.json');
  fs.writeFileSync(f, typeof content === 'string' ? content : JSON.stringify(content));
  return f;
}

test('loadWaivers: missing file means no waivers; valid file is sorted by id', () => {
  assert.deepEqual(loadWaivers(path.join(tmpDir('nofile-'), 'waivers.json')), []);
  const ids = loadWaivers(W).map((w) => w.id);
  assert.deepEqual(ids, [...ids].sort());
  assert.equal(ids.length, 4);
});

test('loadWaivers: rejects bad shape, kind, empty strings, unknown keys, duplicates, bad JSON', () => {
  const bad = [
    [{}, /must be an array/],
    [[entry({ kind: 'flaky' })], /"kind" must be one of unreachable, known-bug/],
    [[entry({ approvedBy: ' ' })], /"approvedBy" must be a non-empty string/],
    [[entry({ evidence: undefined })], /"evidence" must be a non-empty string/],
    [[{ ...entry(), extra: 1 }], /unknown key "extra"/],
    [[entry(), entry()], /duplicate id/],
    [['x'], /must be an object/],
    ['{not json', /Invalid waivers/],
  ];
  for (const [content, re] of bad) {
    assert.throws(() => loadWaivers(writeTmp(content)), (e) => e instanceof InputError && re.test(e.message), String(re));
  }
});

test('analyze: raw summary is unchanged by waivers; effective drops waived ids from the denominator', async () => {
  const none = await build([]);
  const waived = await build(loadWaivers(W));
  assert.deepEqual(waived.summary.scope, none.summary.scope, 'raw scope unchanged');
  assert.deepEqual(waived.summary.global, none.summary.global, 'raw global unchanged');
  assert.deepEqual(waived.operations, none.operations);
  assert.deepEqual(deriveGaps(waived), deriveGaps(none), 'gaps.json stays raw');

  // no waivers: effective == raw
  assert.deepEqual(none.summary.effective.scope, none.summary.scope);
  assert.deepEqual(none.summary.effective.global, none.summary.global);
  assert.deepEqual(none.waivers, []);

  // scope raw: operations 5/6, statuses 4/8; waived: GET /articles (covered op), POST /articles#422, GET /articles/{id}#404
  assert.deepEqual(waived.summary.scope.statuses, { covered: 4, total: 8, percent: 50 });
  assert.deepEqual(waived.summary.effective.scope.statuses, { covered: 4, total: 6, percent: 66.67 });
  assert.deepEqual(waived.summary.effective.scope.operations, { covered: 4, total: 5, percent: 80 });
  assert.deepEqual(waived.summary.effective.global.statuses, { covered: 5, total: 9, percent: 55.56 });
});

test('analyze: waivers are listed separately; unknown ids warn and are not applied; covered ones warn', async () => {
  const r = await build(loadWaivers(W));
  assert.deepEqual(r.waivers.map((w) => [w.id, w.covered]), [
    ['GET /articles', true],
    ['GET /articles/{id}#404', false],
    ['POST /articles#422', false],
  ]);
  assert.equal(r.waivers[1].approvedBy, 'Test Approver');
  const codes = r.warnings.filter((w) => w.code.startsWith('WAIVER_')).map((w) => `${w.code}: ${w.message}`);
  assert.equal(codes.length, 2);
  assert.match(codes.join('\n'), /WAIVER_COVERED: waiver "GET \/articles" is already covered/);
  assert.match(codes.join('\n'), /WAIVER_UNKNOWN_ID: waiver "GET \/gone#200" matches no documented item/);
});

test('analyze: param waivers and an all-waived dimension give null percent', async () => {
  const r = await build([entry({ id: 'POST /articles?body.body' })]);
  assert.equal(r.summary.effective.scope.parameters.total, r.summary.scope.parameters.total - 1);
  const spec = await loadSpec(path.join(FIX, 'mini-openapi.json'));
  const ids = [];
  for (const o of (await build([])).operations.filter((o) => o.inScope)) for (const s of o.statuses) if (s.documented) ids.push(`${o.id}#${s.status}`);
  const all = await build(ids.map((id) => entry({ id })));
  assert.deepEqual(all.summary.effective.scope.statuses, { covered: 0, total: 0, percent: null });
  assert.ok(spec.operations.length > 0);
});

test('report with waivers validates against report.schema.json', async () => {
  const schema = JSON.parse(fs.readFileSync(path.join(TOOL_ROOT, 'schema', 'report.schema.json'), 'utf8'));
  const r = await build(loadWaivers(W));
  assert.deepEqual(validateSchema(schema, JSON.parse(JSON.stringify(r))), []);
});

test('summary, html and console show raw and effective coverage and the waived ids', async () => {
  const r = await build(loadWaivers(W));
  const md = formatSummary(r);
  assert.match(md, /\| statuses \| 4\/8 \(50\.00%\) \| 4\/6 \(66\.67%\) \|/);
  assert.match(md, /\*\*Waived:\*\* 3/);
  assert.match(md, /- `POST \/articles#422` \(known-bug\)/);
  assert.ok(!md.includes('GET /gone#200'), 'stale ids are not listed as waived');

  const html = formatHtml(r);
  assert.match(html, /effective \(waivers excluded\): scope 4\/6 \(66\.67%\)/);
  assert.match(html, /<h2>Waived gaps \(3\)<\/h2>/);
  assert.match(html, /<code>GET \/articles\/\{id\}#404<\/code>/);

  const txt = formatReport(r, []);
  assert.match(txt, /Effective coverage \(3 waived, raw above is unchanged\)/);
  assert.match(txt, /waived \[unreachable\] GET \/articles\/\{id\}#404/);
});

test('renderers tolerate reports without waivers/effective (older reports)', async () => {
  const r = JSON.parse(JSON.stringify(await build([])));
  delete r.summary.effective;
  delete r.waivers;
  assert.ok(!formatSummary(r).includes('Effective'));
  assert.ok(!formatHtml(r).includes('Waived gaps'));
  assert.ok(!formatReport(r, []).includes('Effective coverage'));
});

test('CLI: --waivers is applied; a bad waivers file exits 2; stale waiver warns on stderr', () => {
  const out = tmpDir('cli-w-');
  const ok = run(miniArgs(out));
  assert.equal(ok.code, 0, ok.stderr);
  assert.match(ok.stderr, /warning WAIVER_UNKNOWN_ID: waiver "GET \/gone#200"/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(out, 'report.json'), 'utf8')).waivers.length, 3);

  const args = miniArgs(out).filter((a, i, arr) => a !== '--waivers' && arr[i - 1] !== '--waivers');
  const bad = run([...args, '--waivers', writeTmp([entry({ kind: 'nope' })])]);
  assert.equal(bad.code, 2);
  assert.match(bad.stderr, /Invalid waivers/);
});

test('the seeded coverage-tool/waivers.json is valid and targets the three comment ids', () => {
  const w = loadWaivers(path.join(TOOL_ROOT, 'waivers.json'));
  assert.deepEqual(w.map((x) => [x.id, x.kind]), [
    ['GET /comments/{id}#400', 'known-bug'],
    ['HEAD /comments/{id}#400', 'known-bug'],
    ['PUT /comments/{id}#404', 'unreachable'],
  ]);
});
