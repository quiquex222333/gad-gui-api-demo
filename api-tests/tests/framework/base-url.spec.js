const { test, expect } = require('@playwright/test');
const http = require('http');
const config = require('../../src/config');
const BaseClient = require('../../src/clients/base.client');

// Stub server records the URL it receives, so no GAD server is needed.
async function withStub(fn) {
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push(req.url);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{}');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    await fn(`http://127.0.0.1:${server.address().port}`, seen);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

test.describe('baseURL ending in /api/', () => {
  test('config.BASE_URL is GAD_URL + /api/ and defaults to port 3005', () => {
    expect(config.BASE_URL).toBe(`${config.GAD_URL}/api/`);
    expect(config.BASE_URL.endsWith('/api/')).toBe(true);
    if (process.env.GAD_URL === undefined) expect(config.GAD_URL).toBe('http://localhost:3005');
  });

  test('BaseClient keeps the /api segment for templated and plain paths', async ({ playwright }) => {
    await withStub(async (origin, seen) => {
      const ctx = await playwright.request.newContext({ baseURL: `${origin}/api/` });
      const client = new BaseClient(ctx);
      await client.send('GET', '/articles/{id}', { pathParams: { id: 1 } });
      await client.send('GET', '/articles');
      await ctx.dispose();
      expect(seen).toEqual(['/api/articles/1', '/api/articles']);
    });
  });

  test('pitfall: a leading slash drops /api (why clients send relative paths)', async ({ playwright }) => {
    await withStub(async (origin, seen) => {
      const ctx = await playwright.request.newContext({ baseURL: `${origin}/api/` });
      await ctx.fetch('/articles/1'); // framework self-test only; tests/ must use clients
      await ctx.fetch('articles/1');
      await ctx.dispose();
      expect(seen).toEqual(['/articles/1', '/api/articles/1']);
    });
  });
});
