'use strict';
// Regenerates test/fixtures/pr/{base,head}-report.json and diff.json from the mini fixtures (same pair as diff.test.js).
const fs = require('node:fs');
const path = require('node:path');
const { run, tmpDir, miniArgs, FIX } = require('./helpers');

const dir = tmpDir('prfix-');
const dest = path.join(FIX, 'pr');
fs.mkdirSync(dest, { recursive: true });

const spec = JSON.parse(fs.readFileSync(path.join(FIX, 'mini-openapi.json'), 'utf8'));
spec.paths['/articles/{id}'].put = { responses: { 200: { description: 'ok' } } };
delete spec.paths['/users'];
fs.writeFileSync(path.join(dir, 'head-spec.json'), JSON.stringify(spec));
const lines = fs.readFileSync(path.join(FIX, 'requests-mini.jsonl'), 'utf8').split('\n').filter((l) => !l.includes('"actualPath":"/articles/search"'));
lines.push('{"source":"test","method":"GET","actualPath":"/comments","status":200}');
fs.writeFileSync(path.join(dir, 'head-requests.jsonl'), lines.join('\n') + '\n');

if (run(miniArgs(path.join(dir, 'base'))).code !== 0) throw new Error('base report failed');
const h = run(['report', '--spec', path.join(dir, 'head-spec.json'), '--requests', path.join(dir, 'head-requests.jsonl'), '--config', path.join(FIX, 'mini.config.json'), '--out-dir', path.join(dir, 'head')]);
if (h.code !== 0) throw new Error(h.stderr);
// Paths inside the reports reference the temp dir; normalise to stable fixture names.
for (const [name, src] of [['base', 'base'], ['head', 'head']]) {
  const r = JSON.parse(fs.readFileSync(path.join(dir, src, 'report.json'), 'utf8'));
  r.inputs.spec.path = `${name}/spec.json`;
  r.inputs.requests.path = `${name}/requests.jsonl`;
  fs.writeFileSync(path.join(dest, `${name}-report.json`), JSON.stringify(r, null, 2) + '\n');
}
const d = run(['diff', path.join(dest, 'base-report.json'), path.join(dest, 'head-report.json'), '--out', path.join(dest, 'diff.json')]);
if (d.code !== 0) throw new Error(d.stderr);
// diff.json paths are repo-relative to the temp location; make them stable.
const diff = JSON.parse(fs.readFileSync(path.join(dest, 'diff.json'), 'utf8'));
diff.base.path = 'base-report.json';
diff.head.path = 'head-report.json';
fs.writeFileSync(path.join(dest, 'diff.json'), JSON.stringify(diff, null, 2) + '\n');
console.log('pr fixtures updated in', dest);

// Golden outputs for html / summary.
const exp = path.join(dest, 'expected');
fs.mkdirSync(exp, { recursive: true });
const head = path.join(dest, 'head-report.json');
const dj = path.join(dest, 'diff.json');
for (const [args] of [
  [['summary', head, '--diff', dj, '-o', path.join(exp, 'summary-diff.md')]],
  [['summary', head, '-o', path.join(exp, 'summary-head-only.md')]],
  [['html', head, '--diff', dj, '-o', path.join(exp, 'coverage-diff.html')]],
  [['html', head, '-o', path.join(exp, 'coverage-head-only.html')]],
].map((x) => [x[0]])) {
  const r = run(args);
  if (r.code !== 0) throw new Error(r.stderr);
}
console.log('pr goldens updated in', exp);
