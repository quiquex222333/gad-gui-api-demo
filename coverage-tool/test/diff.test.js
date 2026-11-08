'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { run, tmpDir, miniArgs, FIX } = require('./helpers');

function makeHead(dir) {
  const spec = JSON.parse(fs.readFileSync(path.join(FIX, 'mini-openapi.json'), 'utf8'));
  spec.paths['/articles/{id}'].put = { responses: { 200: { description: 'ok' } } }; // new spec item
  delete spec.paths['/users']; // item removed from spec (was an uncovered gap)
  const specFile = path.join(dir, 'head-spec.json');
  fs.writeFileSync(specFile, JSON.stringify(spec));
  const lines = fs.readFileSync(path.join(FIX, 'requests-mini.jsonl'), 'utf8').split('\n')
    .filter((l) => !l.includes('"actualPath":"/articles/search"')); // regression: search no longer called
  lines.push('{"source":"test","method":"GET","actualPath":"/comments","status":200}'); // closes comments gaps
  const reqFile = path.join(dir, 'head-requests.jsonl');
  fs.writeFileSync(reqFile, lines.join('\n') + '\n');
  return { specFile, reqFile };
}

function buildPair() {
  const dir = tmpDir('diff-');
  const base = path.join(dir, 'base');
  const head = path.join(dir, 'head');
  assert.equal(run(miniArgs(base)).code, 0);
  const { specFile, reqFile } = makeHead(dir);
  const r = run(['report', '--spec', specFile, '--requests', reqFile, '--config', path.join(FIX, 'mini.config.json'), '--out-dir', head]);
  assert.equal(r.code, 0, r.stderr);
  return { dir, base: path.join(base, 'report.json'), head: path.join(head, 'report.json') };
}

test('self-diff: all deltas zero, all lists empty', () => {
  const { dir, base } = buildPair();
  const outFile = path.join(dir, 'self.json');
  const r = run(['diff', base, base, '--out', outFile]);
  assert.equal(r.code, 0, r.stderr);
  const d = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  for (const scope of ['scope', 'global']) {
    for (const dim of ['operations', 'statuses', 'parameters']) {
      const x = d.summary[scope][dim];
      assert.equal(x.deltaCovered, 0);
      assert.equal(x.deltaTotal, 0);
      assert.equal(x.deltaPercent, 0);
    }
  }
  for (const k of ['closed', 'opened', 'added', 'removed']) assert.deepEqual(d.gaps[k], []);
  assert.deepEqual(d.drift, { added: [], removed: [] });
  assert.equal(run(['diff', base, base, '--fail-on-opened']).code, 0);
});

test('fixture pair: closed / opened / added / removed', () => {
  const { dir, base, head } = buildPair();
  const outFile = path.join(dir, 'd.json');
  const r = run(['diff', base, head, '--out', outFile]);
  assert.equal(r.code, 0, r.stderr);
  const d = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  const ids = (k) => d.gaps[k].map((g) => g.id);
  assert.deepEqual(ids('closed'), ['GET /comments', 'GET /comments#200']);
  assert.deepEqual(ids('opened'), ['GET /articles/search', 'GET /articles/search#200', 'GET /articles/search?query.query']);
  assert.deepEqual(ids('added'), ['PUT /articles/{id}', 'PUT /articles/{id}#200', 'PUT /articles/{id}?path.id']);
  assert.deepEqual(ids('removed'), ['GET /users', 'GET /users#200']);
  assert.equal(d.summary.scope.operations.deltaTotal, 1);
  assert.equal(d.summary.scope.operations.base.covered, 5);
  assert.equal(d.summary.scope.operations.head.covered, 5);
  assert.equal(d.base.path.endsWith('base/report.json'), true);
  assert.match(d.base.sha256, /^[0-9a-f]{64}$/);
  // byte-stable
  const out2 = path.join(dir, 'd2.json');
  run(['diff', base, head, '--out', out2]);
  assert.ok(fs.readFileSync(outFile).equals(fs.readFileSync(out2)));
});

test('--fail-on-opened exits 1 when a gap was opened', () => {
  const { base, head } = buildPair();
  assert.equal(run(['diff', base, head, '--fail-on-opened']).code, 1);
  assert.equal(run(['diff', base, head]).code, 0, 'without the flag a regression does not fail');
});

test('major schemaVersion mismatch -> exit 2; bad args -> exit 2', () => {
  const { dir, base } = buildPair();
  const bad = JSON.parse(fs.readFileSync(base, 'utf8'));
  bad.schemaVersion = '2.0.0';
  const badFile = path.join(dir, 'v2.json');
  fs.writeFileSync(badFile, JSON.stringify(bad));
  assert.equal(run(['diff', base, badFile]).code, 2);
  assert.equal(run(['diff', base]).code, 2);
  assert.equal(run(['diff', base, path.join(dir, 'missing.json')]).code, 2);
});

test('diff tolerates reports with missing/null summary.global (estimates)', () => {
  const { dir, base } = buildPair();
  const est = JSON.parse(fs.readFileSync(base, 'utf8'));
  est.summary.global = null;
  const f = path.join(dir, 'est.json');
  fs.writeFileSync(f, JSON.stringify(est));
  const out = path.join(dir, 'e.json');
  assert.equal(run(['diff', f, base, '--out', out]).code, 0);
  const d = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(d.summary.global.operations.deltaCovered, null);
  assert.equal(d.summary.global.operations.base.covered, null);
});
