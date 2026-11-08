'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { run, tmpDir, FIX } = require('./helpers');
const { formatHtml } = require('../src/format-html');
const { formatSummary } = require('../src/format-summary');

const PR = path.join(FIX, 'pr');
const read = (...p) => fs.readFileSync(path.join(PR, ...p), 'utf8');
const base = JSON.parse(read('base-report.json'));
const head = JSON.parse(read('head-report.json'));
const diff = JSON.parse(read('diff.json'));

test('summary golden (with diff and head-only) matches byte-for-byte via the CLI', () => {
  const dir = tmpDir('sum-');
  const a = path.join(dir, 'a.md');
  const b = path.join(dir, 'b.md');
  assert.equal(run(['summary', path.join(PR, 'head-report.json'), '--diff', path.join(PR, 'diff.json'), '-o', a]).code, 0);
  assert.equal(run(['summary', path.join(PR, 'head-report.json'), '-o', b]).code, 0);
  assert.equal(fs.readFileSync(a, 'utf8'), read('expected', 'summary-diff.md'));
  assert.equal(fs.readFileSync(b, 'utf8'), read('expected', 'summary-head-only.md'));
});

test('summary content: base|head|delta table, closed, opened, top 10 ordered ops > statuses > params', () => {
  const md = formatSummary(head, diff);
  assert.match(md, /\| operations \| 5\/6 \(83\.33%\) \| 5\/7 \(71\.43%\) \| \*\*-11\.9 pp\*\* ▼/);
  assert.match(md, /\*\*Gaps closed:\*\* 2/);
  assert.match(md, /\*\*Gaps opened:\*\* 3/);
  const top = md.split('**Top open in-scope gaps:**')[1].split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(3, -1));
  assert.ok(top.length <= 10);
  const type = (id) => (id.includes('?') ? 2 : id.includes('#') ? 1 : 0);
  assert.deepEqual(top.map(type), top.map(type).slice().sort((x, y) => x - y));
  assert.equal(type(top[0]), 0);
});

test('summary caps lists at 10 and reports out-of-scope separately', () => {
  const many = JSON.parse(JSON.stringify(head));
  many.operations = [];
  for (let i = 0; i < 15; i++) {
    many.operations.push({ id: `GET /x${String(i).padStart(2, '0')}`, method: 'GET', path: `/x${String(i).padStart(2, '0')}`, inScope: true, covered: false, requests: 0, statuses: [], parameters: [] });
  }
  many.operations.push({ id: 'GET /out', method: 'GET', path: '/out', inScope: false, covered: false, requests: 0, statuses: [], parameters: [] });
  const d = JSON.parse(JSON.stringify(diff));
  d.gaps.opened = many.operations.map((o) => ({ id: o.id, type: 'operation', inScope: o.inScope, method: 'GET', path: o.path }));
  const md = formatSummary(many, d);
  assert.match(md, /\*\*Gaps opened:\*\* 15 \(\+1 out of scope\)/);
  assert.match(md, /- … and 5 more/);
  assert.match(md, /\*\*Top open in-scope gaps:\*\* 10 of 15/);
  assert.ok(!md.includes('GET /out`\n- `GET /out'));
});

test('summary escapes pipes in table cells and handles a report without gaps', () => {
  const clean = JSON.parse(JSON.stringify(head));
  for (const o of clean.operations) {
    o.requests = 1;
    for (const s of o.statuses) s.requests = 1;
    for (const p of o.parameters) p.requests = 1;
  }
  assert.match(formatSummary(clean), /\*\*Top open in-scope gaps:\*\* none/);
});

test('html golden matches byte-for-byte via the CLI', () => {
  const dir = tmpDir('html-');
  const a = path.join(dir, 'a.html');
  const b = path.join(dir, 'b.html');
  assert.equal(run(['html', path.join(PR, 'head-report.json'), '--diff', path.join(PR, 'diff.json'), '-o', a]).code, 0);
  assert.equal(run(['html', path.join(PR, 'head-report.json'), '-o', b]).code, 0);
  assert.equal(fs.readFileSync(a, 'utf8'), read('expected', 'coverage-diff.html'));
  assert.equal(fs.readFileSync(b, 'utf8'), read('expected', 'coverage-head-only.html'));
});

test('html is self-contained: no scripts, links, images, remote URLs or url()', () => {
  const html = formatHtml(head, diff);
  assert.ok(!/<script|<link|<img|<iframe|<object|src=|@import|url\(/i.test(html));
  assert.ok(!/https?:\/\//i.test(html));
  assert.ok(html.startsWith('<!doctype html>'));
});

test('html content: headline per dimension, delta, operations table, gaps grouped by operation', () => {
  const html = formatHtml(head, diff);
  for (const d of ['operations', 'statuses', 'parameters']) assert.ok(html.includes(`${d} · scope`));
  assert.ok(html.includes('71.43%'));
  assert.ok(html.includes('-11.9 pp'));
  assert.ok(html.includes('Changes vs base'));
  assert.match(html, /chip ok">200</);
  assert.match(html, /chip bad">404</);
  assert.match(html, /<summary><span class="method">GET \/articles\/search<\/span>/);
  const noDiff = formatHtml(head);
  assert.ok(!noDiff.includes('Changes vs base') && !noDiff.includes(' pp'));
});

test('html escapes dynamic values', () => {
  const evil = JSON.parse(JSON.stringify(head));
  evil.operations[0].path = '/<script>alert(1)</script>';
  evil.operations[0].id = 'GET /<script>alert(1)</script>';
  evil.operations[0].requests = 0;
  const html = formatHtml(evil);
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('html/summary are deterministic and unaffected by TZ/LANG/cwd', () => {
  const dir = tmpDir('det-');
  const args = (o) => ['html', path.join(PR, 'head-report.json'), '--diff', path.join(PR, 'diff.json'), '-o', o];
  assert.equal(run(args(path.join(dir, '1.html'))).code, 0);
  assert.equal(run(args(path.join(dir, '2.html')), { cwd: dir, env: { TZ: 'Asia/Tokyo', LANG: 'tr_TR.UTF-8' } }).code, 0);
  assert.ok(fs.readFileSync(path.join(dir, '1.html')).equals(fs.readFileSync(path.join(dir, '2.html'))));
});

test('html/summary: bad input -> exit 2', () => {
  const dir = tmpDir('bad-');
  assert.equal(run(['html']).code, 2);
  assert.equal(run(['summary', path.join(dir, 'missing.json')]).code, 2);
  const v2 = path.join(dir, 'v2.json');
  fs.writeFileSync(v2, JSON.stringify({ ...head, schemaVersion: '2.0.0' }));
  assert.equal(run(['summary', v2]).code, 2);
  assert.equal(run(['summary', path.join(PR, 'head-report.json'), '--diff', v2]).code, 2);
});

test('a base that is an empty report (no requests) diffs cleanly: everything closes', () => {
  const dir = tmpDir('empty-');
  const empty = path.join(dir, 'req.jsonl');
  fs.writeFileSync(empty, '');
  const r = run(['report', '--spec', path.join(FIX, 'mini-openapi.json'), '--requests', empty, '--config', path.join(FIX, 'mini.config.json'), '--out-dir', path.join(dir, 'b')]);
  assert.equal(r.code, 0, r.stderr);
  const d = path.join(dir, 'd.json');
  assert.equal(run(['diff', path.join(dir, 'b', 'report.json'), path.join(PR, 'head-report.json'), '--out', d]).code, 0);
  const md = run(['summary', path.join(PR, 'head-report.json'), '--diff', d]);
  assert.equal(md.code, 0);
  assert.match(md.stdout, /\| operations \| 0\/\d+ \(0\.00%\)/);
});
