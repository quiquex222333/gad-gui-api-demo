const { test, expect } = require('../src/fixtures');
const { buildComment } = require('../src/builders/comment.builder');

test.describe('Comments', () => {
  test('GET /comments returns a list', async ({ api }) => {
    const res = await api.comments.list();
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });

  test('GET /comments/{id} returns the comment', async ({ api }) => {
    const res = await api.comments.get(1);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(1);
    expect(typeof body.body).toBe('string');
  });

  test('POST /comments creates a comment when authenticated', async ({ authApi }) => {
    const payload = buildComment();
    const res = await authApi.comments.create(payload);
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(body.body).toBe(payload.body);

    const fetched = await authApi.comments.get(body.id);
    expect(fetched.status()).toBe(200);
    expect((await fetched.json()).body).toBe(payload.body);
  });

  test('POST /comments without auth is rejected', async ({ api }) => {
    const res = await api.comments.create(buildComment());
    expect(res.status()).toBe(401);
  });
});
