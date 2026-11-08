'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { globToRegExp, matchesAny, compileGlobs } = require('../src/glob');
const { createMatcher } = require('../src/matcher');
const { parseRequests } = require('../src/requests-loader');
const { sortCanonical } = require('../src/sort');
const { stringify } = require('../src/write-json');
const { toRepoRelative, REPO_ROOT } = require('../src/paths');
const { loadConfig, DEFAULTS, InputError } = require('../src/config');
const { metric } = require('../src/analyze');
const { tmpDir } = require('./helpers');

test('glob: * crosses "/" and everything else is literal', () => {
  assert.ok(globToRegExp('/articles*').test('/articles'));
  assert.ok(globToRegExp('/articles*').test('/articles/{id}'));
  assert.ok(globToRegExp('/debug/*').test('/debug/x/y'));
  assert.ok(!globToRegExp('/debug/*').test('/debug'));
  assert.ok(!globToRegExp('/login').test('/login/x'));
  assert.ok(globToRegExp('/a/{id}').test('/a/{id}'));
  assert.ok(!globToRegExp('/a.b').test('/aXb'));
});

test('config: defaults when file absent, exclude/scope shape validated', () => {
  const dir = tmpDir('cfg-');
  const missing = loadConfig(path.join(dir, 'nope.json'));
  assert.deepEqual(missing.scope, DEFAULTS.scope);
  assert.deepEqual(missing.exclude, DEFAULTS.exclude);
  assert.equal(missing.sha256, null);

  const bad = path.join(dir, 'bad.json');
  fs.writeFileSync(bad, '{"scope": "/articles*"}');
  assert.throws(() => loadConfig(bad), InputError);
  fs.writeFileSync(bad, '{"scope": [], "excluded": []}');
  assert.throws(() => loadConfig(bad), InputError);
  fs.writeFileSync(bad, '{nope');
  assert.throws(() => loadConfig(bad), InputError);
});

test('matcher: path params, literal precedence, no match', () => {
  const m = createMatcher([
    '/articles', '/articles/search', '/articles/{id}',
    '/surveys/statistics/{type}', '/surveys/{surveyType}/description',
  ]);
  assert.equal(m.matchPath('/articles/search').path, '/articles/search');
  assert.equal(m.matchPath('/articles/7').path, '/articles/{id}');
  assert.equal(m.matchPath('/articles').path, '/articles');
  assert.equal(m.matchPath('/surveys/statistics/description').path, '/surveys/statistics/{type}');
  assert.equal(m.matchPath('/surveys/statistics/description').ambiguous, null);
  assert.equal(m.matchPath('/surveys/foo/description').path, '/surveys/{surveyType}/description');
  assert.equal(m.matchPath('/unknown'), null);
  assert.equal(m.matchPath('/articles/7/extra'), null);
  assert.equal(m.matchPath('/articles/'), null, 'empty segment never matches {id}');
});

test('matcher: templates differing only in param names are ambiguous, lowest key wins', () => {
  const m = createMatcher(['/x/{b}', '/x/{a}']);
  const r = m.matchPath('/x/1');
  assert.equal(r.path, '/x/{a}');
  assert.deepEqual(r.ambiguous, ['/x/{a}', '/x/{b}']);
});

test('requests-loader: classifies lines, ignores setup, normalises', () => {
  const text = [
    '{"source":"setup","method":"GET","actualPath":"/x","status":200}',
    '{"source":"test","method":"get","actualPath":"/articles/","status":200,"queryParams":["a"],"bodyFields":"nope"}',
    '{"source":"test","method":"GET","actualPath":"/","status":200}',
    '{"source":"test","method":"GET","actualPath":"/a","status":null}',
    '{"method":"GET","actualPath":"/a","status":200}',
    'garbage',
    '',
    '{"source":"test","method":"GET","status":200}',
    '[1]',
  ].join('\n');
  const r = parseRequests(text);
  assert.deepEqual(r.counts, { total: 8, invalid: 3, nonTest: 2, nullStatus: 1 });
  assert.equal(r.records.length, 2);
  assert.deepEqual(r.records[0], {
    method: 'GET', actualPath: '/articles', status: 200, queryParams: ['a'], bodyFields: [], recorderTemplate: null,
  });
  assert.equal(r.records[1].actualPath, '/');
  assert.deepEqual(r.warnings.map((w) => w.message), ['line 6: invalid JSON', 'line 8: missing method or actualPath', 'line 9: not a JSON object']);
});

test('sort: canonical order path -> method rank -> type -> status -> in -> param', () => {
  const items = [
    { id: 'c', path: '/b', method: 'GET', type: 'operation' },
    { id: 'd', path: '/a', method: 'DELETE', type: 'operation' },
    { id: 'e', path: '/a', method: 'POST', type: 'param', in: 'body', param: 'z' },
    { id: 'f', path: '/a', method: 'POST', type: 'param', in: 'query', param: 'z' },
    { id: 'g', path: '/a', method: 'POST', type: 'status', status: 422 },
    { id: 'h', path: '/a', method: 'POST', type: 'status', status: 201 },
    { id: 'i', path: '/a', method: 'POST', type: 'operation' },
    { id: 'j', path: '/a', method: 'GET', type: 'operation' },
  ];
  assert.deepEqual(sortCanonical(items).map((i) => i.id), ['j', 'i', 'h', 'g', 'f', 'e', 'd', 'c']);
});

test('metric: integer percent rounding, null on empty', () => {
  assert.deepEqual(metric(1, 3), { covered: 1, total: 3, percent: 33.33 });
  assert.deepEqual(metric(2, 3), { covered: 2, total: 3, percent: 66.67 });
  assert.deepEqual(metric(0, 0), { covered: 0, total: 0, percent: null });
  assert.deepEqual(metric(5, 5), { covered: 5, total: 5, percent: 100 });
});

test('write-json: 2-space indent, single trailing newline', () => {
  const s = stringify({ a: [1] });
  assert.equal(s, '{\n  "a": [\n    1\n  ]\n}\n');
  assert.ok(!s.endsWith('\n\n'));
});

test('paths: repo-relative with "/" separators', () => {
  assert.equal(toRepoRelative(path.join(REPO_ROOT, 'a', 'b.json')), 'a/b.json');
  assert.equal(toRepoRelative(REPO_ROOT), '.');
});

test('compileGlobs/matchesAny', () => {
  assert.ok(matchesAny(compileGlobs(['/a*', '/b']), '/b'));
  assert.ok(!matchesAny(compileGlobs([]), '/b'));
});
