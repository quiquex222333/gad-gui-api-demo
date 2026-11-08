const { test, expect } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');

test.describe('recorder', () => {
  let tmp;
  test.beforeEach(() => {
    tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rec-')), 'sub', 'r.jsonl');
    process.env.COVERAGE_FILE = tmp;
  });
  test.afterEach(() => {
    delete process.env.COVERAGE_FILE;
  });

  test('writes valid JSON lines and honours COVERAGE_FILE', () => {
    const recorder = require('../../src/recorder');
    recorder.reset();
    recorder.record({ a: 1 });
    recorder.record({ b: 2 });
    const lines = fs.readFileSync(tmp, 'utf8').trim().split('\n');
    expect(lines.map((l) => JSON.parse(l))).toEqual([{ a: 1 }, { b: 2 }]);
  });
});

test.describe('BaseClient', () => {
  test('records template, actual path, sorted names and null status on network error', async () => {
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rec-')), 'r.jsonl');
    process.env.COVERAGE_FILE = tmp;
    try {
      const BaseClient = require('../../src/clients/base.client');
      const ok = { fetch: async () => ({ status: () => 200 }) };
      const bad = { fetch: async () => { throw new Error('boom'); } };

      await new BaseClient(ok).send('get', '/articles/{id}', {
        pathParams: { id: 1 },
        params: { b: 1, a: 2 },
        data: { title: 'x', body: 'y' },
      });
      await expect(new BaseClient(bad).send('GET', '/articles')).rejects.toThrow('boom');

      const [first, second] = fs.readFileSync(tmp, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
      expect(first).toEqual({
        source: 'test',
        method: 'GET',
        pathTemplate: '/articles/{id}',
        actualPath: '/articles/1',
        status: 200,
        queryParams: ['a', 'b'],
        bodyFields: ['body', 'title'],
      });
      expect(second.status).toBeNull();
      expect(second.source).toBe('test');

      await new BaseClient(ok, { source: 'setup' }).send('GET', '/restoreTestDB');
      const last = fs.readFileSync(tmp, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).pop();
      expect(last.source).toBe('setup');
    } finally {
      delete process.env.COVERAGE_FILE;
    }
  });
});
