'use strict';
// Regenerates test/fixtures/expected/* from the mini fixtures. Review the git diff before committing.
const path = require('node:path');
const fs = require('node:fs');
const { run, miniArgs, FIX } = require('./helpers');

const out = path.join(FIX, 'expected');
const r = run(miniArgs(out));
if (r.code !== 0) throw new Error(r.stderr);
fs.writeFileSync(path.join(out, 'report.stdout.txt'), r.stdout);
fs.writeFileSync(path.join(out, 'report.stderr.txt'), r.stderr);
console.log('golden files updated in', out);
