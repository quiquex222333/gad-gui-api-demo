'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { run, tmpDir, miniArgs, FIX } = require('./helpers');

const exp = (f) => fs.readFileSync(path.join(FIX, 'expected', f), 'utf8');

test('golden: mini fixture report.json / gaps.json / stdout / stderr match byte-for-byte', () => {
  const out = tmpDir('golden-');
  const r = run(miniArgs(out));
  assert.equal(r.code, 0, r.stderr);
  assert.equal(fs.readFileSync(path.join(out, 'report.json'), 'utf8'), exp('report.json'));
  assert.equal(fs.readFileSync(path.join(out, 'gaps.json'), 'utf8'), exp('gaps.json'));
  // stdout lists the output dir, which differs for the temp dir: compare everything before "Written:"
  const strip = (s) => s.split('\nWritten:')[0];
  assert.equal(strip(r.stdout), strip(exp('report.stdout.txt')));
  assert.equal(r.stderr, exp('report.stderr.txt'));
});

test('golden files end with a single newline and use LF only', () => {
  for (const f of ['report.json', 'gaps.json']) {
    const s = exp(f);
    assert.ok(s.endsWith('}\n') || s.endsWith(']\n'));
    assert.ok(!s.endsWith('\n\n'));
    assert.ok(!s.includes('\r'));
  }
});
