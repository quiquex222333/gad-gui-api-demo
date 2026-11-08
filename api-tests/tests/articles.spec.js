const { test, expect } = require('../src/fixtures');
const { buildArticle } = require('../src/builders/article.builder');

test.describe('Articles', () => {
  test('GET /articles returns a list', async ({ api }) => {
    const res = await api.articles.list();
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });

  test('GET /articles/{id} returns the article', async ({ api }) => {
    const res = await api.articles.get(1);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(1);
    expect(typeof body.title).toBe('string');
  });

  test('POST /articles creates an article when authenticated', async ({ authApi }) => {
    const payload = buildArticle();
    const res = await authApi.articles.create(payload);
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(body.title).toBe(payload.title);
    expect(body.body).toBe(payload.body);

    const fetched = await authApi.articles.get(body.id);
    expect(fetched.status()).toBe(200);
    expect((await fetched.json()).title).toBe(payload.title);
  });

  test('POST /articles without auth is rejected', async ({ api }) => {
    const res = await api.articles.create(buildArticle());
    expect(res.status()).toBe(401);
  });
});
