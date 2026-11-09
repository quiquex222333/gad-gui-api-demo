const { test, expect } = require('../src/fixtures');
const { buildArticle } = require('../src/builders/article.builder');
const { uniqueId } = require('../src/builders/unique');

const JSON_HEADERS = { 'content-type': 'application/json' };
const MALFORMED_JSON = '{bad json';

async function createOwn(authApi, overrides) {
  const payload = buildArticle(overrides);
  const res = await authApi.articles.create(payload);
  expect(res.status()).toBe(201);
  return { payload, body: await res.json() };
}

test.describe('Articles write operations', () => {
  // --- POST /articles (400, 422)
  test('POST /articles with malformed JSON returns 400', async ({ authApi }) => {
    const res = await authApi.articles.create(MALFORMED_JSON, JSON_HEADERS);
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain('SyntaxError');
  });

  test('POST /articles without mandatory fields returns 422', async ({ authApi }) => {
    const res = await authApi.articles.create({ title: `QA ${uniqueId()}` });
    expect(res.status()).toBe(422);
    const body = await res.json();
    expect(body.error.details).toContain('body');
  });

  // --- GET /articles/{id} 404
  test('GET /articles/{id} for a missing article returns 404', async ({ api }) => {
    const res = await api.articles.get(`missing-${uniqueId()}`);
    expect(res.status()).toBe(404);
  });

  // --- HEAD
  test('HEAD /articles/{id} returns 200 for an existing article', async ({ authApi }) => {
    const { body } = await createOwn(authApi);
    const res = await authApi.articles.head(body.id);
    expect(res.status()).toBe(200);
  });

  test('HEAD /articles/{id} for a missing article returns 404', async ({ api }) => {
    const res = await api.articles.head(`missing-${uniqueId()}`);
    expect(res.status()).toBe(404);
  });

  test('HEAD /articles/{id} with a malformed JSON body returns 400', async ({ api }) => {
    const res = await api.articles.head(1, MALFORMED_JSON, JSON_HEADERS);
    expect(res.status()).toBe(400);
  });

  // --- PUT
  test('PUT /articles/{id} updates an own article', async ({ authApi }) => {
    const { body: created } = await createOwn(authApi);
    const update = buildArticle({ image: '' });
    const res = await authApi.articles.put(created.id, update);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.title).toBe(update.title);
    expect(body.body).toBe(update.body);

    const fetched = await authApi.articles.get(created.id);
    expect(fetched.status()).toBe(200);
    expect((await fetched.json()).title).toBe(update.title);
  });

  test('PUT /articles/{id} for a new id creates the article with 201', async ({ authApi }) => {
    const payload = buildArticle();
    const res = await authApi.articles.put(`new-${uniqueId()}`, payload);
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.title).toBe(payload.title);

    const fetched = await authApi.articles.get(body.id);
    expect(fetched.status()).toBe(200);
  });

  test('PUT /articles/{id} with malformed JSON returns 400', async ({ authApi }) => {
    const { body: created } = await createOwn(authApi);
    const res = await authApi.articles.put(created.id, MALFORMED_JSON, JSON_HEADERS);
    expect(res.status()).toBe(400);
  });

  test('PUT /articles/{id} without auth returns 401', async ({ api }) => {
    const res = await api.articles.put(1, buildArticle());
    expect(res.status()).toBe(401);
  });

  test('PUT /articles/{id} for a missing article returns 404', async ({ authApi }) => {
    // BUG? spec: 404 for unknown id, app: 201 (upsert, creates the article) (endpoints/articles-endpoint.helpers.js:294)
    test.fail();
    const res = await authApi.articles.put(`missing-${uniqueId()}`, buildArticle());
    expect(res.status()).toBe(404);
  });

  test('PUT /articles/{id} without mandatory fields returns 422', async ({ authApi }) => {
    const { body: created } = await createOwn(authApi);
    const res = await authApi.articles.put(created.id, { title: `QA ${uniqueId()}` });
    expect(res.status()).toBe(422);
  });

  // --- PATCH
  test('PATCH /articles/{id} updates fields of an own article', async ({ authApi }) => {
    const { payload, body: created } = await createOwn(authApi);
    const patch = {
      title: `Patched ${uniqueId()}`,
      body: `Patched body ${uniqueId()}`,
      date: payload.date,
      image: '',
      user_id: created.user_id,
    };
    const res = await authApi.articles.patch(created.id, patch);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.title).toBe(patch.title);
    expect(body.body).toBe(patch.body);

    const fetched = await authApi.articles.get(created.id);
    expect((await fetched.json()).title).toBe(patch.title);
  });

  test('PATCH /articles/{id} with malformed JSON returns 400', async ({ authApi }) => {
    const { body: created } = await createOwn(authApi);
    const res = await authApi.articles.patch(created.id, MALFORMED_JSON, JSON_HEADERS);
    expect(res.status()).toBe(400);
  });

  test('PATCH /articles/{id} without auth returns 401', async ({ api }) => {
    const res = await api.articles.patch(1, { title: `QA ${uniqueId()}` });
    expect(res.status()).toBe(401);
  });

  test('PATCH /articles/{id} for a missing article returns 404', async ({ authApi }) => {
    const res = await authApi.articles.patch(`missing-${uniqueId()}`, { title: `QA ${uniqueId()}` });
    expect(res.status()).toBe(404);
  });

  test('PATCH /articles/{id} without any field returns 422', async ({ authApi }) => {
    const { body: created } = await createOwn(authApi);
    const res = await authApi.articles.patch(created.id, {});
    expect(res.status()).toBe(422);
  });

  // --- DELETE
  test('DELETE /articles/{id} removes an own article', async ({ authApi }) => {
    const { body: created } = await createOwn(authApi);
    const res = await authApi.articles.delete(created.id);
    expect(res.status()).toBe(200);

    const again = await authApi.articles.delete(created.id);
    expect(again.status()).toBe(404);
  });

  test('DELETE /articles/{id} with malformed JSON returns 400', async ({ authApi }) => {
    const { body: created } = await createOwn(authApi);
    const res = await authApi.articles.delete(created.id, MALFORMED_JSON, JSON_HEADERS);
    expect(res.status()).toBe(400);
  });

  test('DELETE /articles/{id} without auth returns 401', async ({ api }) => {
    const res = await api.articles.delete(1);
    expect(res.status()).toBe(401);
  });

  // --- POST /articles/{id}/archive
  test('POST /articles/{id}/archive archives an own article', async ({ authApi }) => {
    const { body: created } = await createOwn(authApi);
    const res = await authApi.articles.archive(created.id);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(created.id);
    expect(body.archived).toBe(true);
    expect(body.archived_at).toBeDefined();
  });

  test('POST /articles/{id}/archive without auth returns 401', async ({ api }) => {
    const res = await api.articles.archive(1);
    expect(res.status()).toBe(401);
  });

  test('POST /articles/{id}/archive for a missing article returns 404', async ({ authApi }) => {
    const res = await authApi.articles.archive(`missing-${uniqueId()}`);
    expect(res.status()).toBe(404);
  });

  test('POST /articles/{id}/archive twice returns 409', async ({ authApi }) => {
    const { body: created } = await createOwn(authApi);
    expect((await authApi.articles.archive(created.id)).status()).toBe(200);
    const res = await authApi.articles.archive(created.id);
    expect(res.status()).toBe(409);
  });
});
