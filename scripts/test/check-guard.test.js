'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkCommit } = require('../check-guard');

const c = (agents, files) => checkCommit({ sha: 'abcdef1234', agents, files });

test('test-generator may touch api-tests and docs/agent-runs only', () => {
  assert.deepEqual(c(['test-generator'], ['api-tests/tests/a.spec.js', 'docs/agent-runs/x.md']), []);
  assert.equal(c(['test-generator'], ['api-tests/a.js', 'server.js']).length, 1);
  assert.equal(c(['test-generator'], ['api-tests-extra/a.js']).length, 1);
});

test('feature-developer must not touch api-tests, coverage-tool, .github', () => {
  assert.deepEqual(c(['feature-developer'], ['routes/a.js']), []);
  for (const f of ['api-tests/a.js', 'coverage-tool/src/x.js', '.github/workflows/a.yml']) {
    assert.equal(c(['feature-developer'], [f]).length, 1, f);
  }
});

test('no commit may include db/db.json, with or without trailer', () => {
  assert.equal(c([], ['db/db.json']).length, 1);
  assert.equal(c(['test-generator'], ['db/db.json']).length, 2);
});

test('untrailered and unknown-agent commits are otherwise unconstrained', () => {
  assert.deepEqual(c([], ['api-tests/a.js', 'server.js']), []);
  assert.deepEqual(c(['other'], ['server.js']), []);
});
