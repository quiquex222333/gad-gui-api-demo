'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { run, tmpDir, miniArgs, validateSchema, TOOL_ROOT, FIX, REPO_ROOT } = require('./helpers');

const schema = JSON.parse(fs.readFileSync(path.join(TOOL_ROOT, 'schema', 'report.schema.json'), 'utf8'));

test('--help exits 0', () => {
  const r = run(['--help']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /report/);
});

test('exit 2: missing requests file, missing spec, bad config, unknown command', () => {
  const out = tmpDir('cli-');
  let r = run(['report', '--spec', path.join(FIX, 'mini-openapi.json'), '--requests', path.join(out, 'nope.jsonl'), '--out-dir', out]);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /Cannot read requests file/);
  r = run(['report', '--spec', path.join(out, 'nope.json'), '--out-dir', out]);
  assert.equal(r.code, 2);
  const bad = path.join(out, 'bad.json');
  fs.writeFileSync(bad, '{"scope": 1}');
  r = run(['report', '--config', bad, '--spec', path.join(FIX, 'mini-openapi.json'), '--requests', path.join(FIX, 'requests-mini.jsonl'), '--out-dir', out]);
  assert.equal(r.code, 2);
  assert.equal(run(['frobnicate']).code, 2);
  assert.equal(run(['report', '--nope']).code, 2);
});

test('exit 0 regardless of coverage level', () => {
  const out = tmpDir('cli-');
  assert.equal(run(miniArgs(out)).code, 0);
});

test('generated report validates against the schema; an extra key fails', () => {
  const out = tmpDir('cli-');
  run(miniArgs(out));
  const report = JSON.parse(fs.readFileSync(path.join(out, 'report.json'), 'utf8'));
  assert.deepEqual(validateSchema(schema, report), []);
  const extra = { ...report, surprise: true };
  assert.ok(validateSchema(schema, extra).some((e) => /unexpected key "surprise"/.test(e)));
  const nested = JSON.parse(JSON.stringify(report));
  nested.operations[0].oops = 1;
  assert.ok(validateSchema(schema, nested).length > 0);
});

test('determinism: two runs, different cwd/TZ/LANG, identical bytes and stdout', () => {
  const a = tmpDir('det-a-');
  const b = tmpDir('det-b-');
  // output dir is part of stdout, so compare stdout up to "Written:"
  const strip = (s) => s.split('\nWritten:')[0];
  const r1 = run(miniArgs(a), { cwd: TOOL_ROOT, env: { TZ: 'UTC', LANG: 'C' } });
  const r2 = run(miniArgs(b), { cwd: os_tmp(), env: { TZ: 'Pacific/Kiritimati', LANG: 'tr_TR.UTF-8', LC_ALL: 'tr_TR.UTF-8' } });
  assert.equal(r1.code, 0);
  assert.equal(r2.code, 0);
  for (const f of ['report.json', 'gaps.json']) {
    assert.ok(fs.readFileSync(path.join(a, f)).equals(fs.readFileSync(path.join(b, f))), f);
  }
  assert.equal(strip(r1.stdout), strip(r2.stdout));
  assert.equal(r1.stderr, r2.stderr);
});

function os_tmp() {
  return require('node:os').tmpdir();
}

test('source hygiene: no clock/random/locale/network usage in src/', () => {
  const dir = path.join(TOOL_ROOT, 'src');
  const banned = [/\bDate\b/, /Math\.random/, /localeCompare/, /os\.EOL/, /require\(['"](node:)?(http|https|net|dgram|tls|dns)['"]\)/, /\bfetch\s*\(/, /process\.cwd\(/, /toLocale/, /Intl\./];
  for (const f of fs.readdirSync(dir)) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\/.*$/gm, ''); // ignore comments
    for (const re of banned) assert.ok(!re.test(src), `${f} uses ${re}`);
  }
});

test('real-repo smoke: report on current spec + requests validates', { skip: !fs.existsSync(path.join(REPO_ROOT, 'api-tests/.coverage/requests.jsonl')) }, () => {
  const out = tmpDir('smoke-');
  const r = run(['report', '--out-dir', out]);
  assert.equal(r.code, 0, r.stderr);
  const report = JSON.parse(fs.readFileSync(path.join(out, 'report.json'), 'utf8'));
  assert.deepEqual(validateSchema(schema, report), []);
  assert.equal(report.inputs.spec.operationsTotal, 170);
  assert.equal(report.summary.global.operations.total, 170 - report.inputs.spec.operationsExcluded);
  assert.equal(report.summary.scope.operations.total, 26);
});
