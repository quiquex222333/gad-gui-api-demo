const { test, expect } = require('../src/fixtures');
const { buildComment } = require('../src/builders/comment.builder');
const { buildArticle } = require('../src/builders/article.builder');
const { uniqueId } = require('../src/builders/unique');

const JSON_HEADERS = { 'content-type': 'application/json' };
const MALFORMED_JSON = '{bad';

// PUT/PATCH validate that article_id exists (endpoints/comments-endpoint.helpers.js:150,95), so create a real article.
async function createArticleId(authApi) {
  const res = await authApi.articles.create(buildArticle());
  expect(res.status()).toBe(201);
  return (await res.json()).id;
}

async function createOwnComment(authApi) {
  const articleId = await createArticleId(authApi);
  const payload = buildComment({ article_id: articleId });
  const res = await authApi.comments.create(payload);
  expect(res.status()).toBe(201);
  return { id: (await res.json()).id, articleId, payload };
}

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

  // POST /comments: 400 and 422 (malformed JSON: json-server body parser; validation: helpers.js:158,168)
  test('POST /comments with malformed JSON returns 400', async ({ authApi }) => {
    const res = await authApi.comments.create(MALFORMED_JSON, JSON_HEADERS);
    expect(res.status()).toBe(400);
  });

  test('POST /comments with missing mandatory fields returns 422', async ({ authApi }) => {
    const res = await authApi.comments.create({});
    expect(res.status()).toBe(422);
    const body = await res.json();
    expect(body.error.details).toEqual(expect.arrayContaining(['article_id', 'body', 'date']));
  });

  // GET /comments/{id}: spec documents 400 for an invalid id, app answers 404 (helpers/json-server)
  test('GET /comments/{id} with an invalid id returns 400', async ({ api }) => {
    test.fail();
    // BUG? spec: 400 for invalid id, app: 404 {} for non-numeric id (json-server resource lookup, no id validation in endpoints/comments-endpoint.helpers.js)
    const res = await api.comments.get('abc');
    expect(res.status()).toBe(400);
  });

  test('GET /comments/{id} with an unknown id returns 404', async ({ api }) => {
    const res = await api.comments.get(`missing-${uniqueId()}`);
    expect(res.status()).toBe(404);
  });

  // HEAD /comments/{id}
  test('HEAD /comments/{id} returns 200 for an existing comment', async ({ authApi, api }) => {
    const { id } = await createOwnComment(authApi);
    const res = await api.comments.head(id);
    expect(res.status()).toBe(200);
  });

  test('HEAD /comments/{id} with an invalid id returns 400', async ({ api }) => {
    test.fail();
    // BUG? spec: 400 for invalid id, app: 404 for non-numeric id (no id validation in endpoints/comments-endpoint.helpers.js)
    const res = await api.comments.head('abc');
    expect(res.status()).toBe(400);
  });

  test('HEAD /comments/{id} with an unknown id returns 404', async ({ api }) => {
    const res = await api.comments.head(`missing-${uniqueId()}`);
    expect(res.status()).toBe(404);
  });

  // PUT /comments/{id}
  test('PUT /comments/{id} updates an own comment (200)', async ({ authApi }) => {
    const { id, articleId } = await createOwnComment(authApi);
    const payload = buildComment({ article_id: articleId });
    const res = await authApi.comments.put(id, payload);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.body).toBe(payload.body);

    const fetched = await authApi.comments.get(id);
    expect(fetched.status()).toBe(200);
    expect((await fetched.json()).body).toBe(payload.body);
  });

  test('PUT /comments/{id} with an unknown id creates the comment (201)', async ({ authApi }) => {
    const articleId = await createArticleId(authApi);
    const payload = buildComment({ article_id: articleId });
    const res = await authApi.comments.put(`missing-${uniqueId()}`, payload);
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(body.body).toBe(payload.body);

    const fetched = await authApi.comments.get(body.id);
    expect(fetched.status()).toBe(200);
    expect((await fetched.json()).body).toBe(payload.body);
  });

  test('PUT /comments/{id} with malformed JSON returns 400', async ({ authApi }) => {
    const { id } = await createOwnComment(authApi);
    const res = await authApi.comments.put(id, MALFORMED_JSON, JSON_HEADERS);
    expect(res.status()).toBe(400);
  });

  test('PUT /comments/{id} without auth is rejected with 401', async ({ api, authApi }) => {
    const { id, articleId } = await createOwnComment(authApi);
    const res = await api.comments.put(id, buildComment({ article_id: articleId }));
    expect(res.status()).toBe(401);
  });

  test('PUT /comments/{id} with an invalid payload returns 422', async ({ authApi }) => {
    const { id } = await createOwnComment(authApi);
    const res = await authApi.comments.put(id, { body: 'only body' });
    expect(res.status()).toBe(422);
  });

  // PUT 404: documented but no code path produces it (missing id upserts with 201) -> proposed waiver.

  // PATCH /comments/{id}
  test('PATCH /comments/{id} updates an own comment (200)', async ({ authApi }) => {
    const { id, articleId } = await createOwnComment(authApi);
    const payload = buildComment({ article_id: articleId });
    const res = await authApi.comments.patch(id, { ...payload, user_id: 1 });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.body).toBe(payload.body);

    const fetched = await authApi.comments.get(id);
    expect(fetched.status()).toBe(200);
    expect((await fetched.json()).body).toBe(payload.body);
  });

  test('PATCH /comments/{id} with malformed JSON returns 400', async ({ authApi }) => {
    const { id } = await createOwnComment(authApi);
    const res = await authApi.comments.patch(id, MALFORMED_JSON, JSON_HEADERS);
    expect(res.status()).toBe(400);
  });

  test('PATCH /comments/{id} without auth is rejected with 401', async ({ api, authApi }) => {
    const { id } = await createOwnComment(authApi);
    const res = await api.comments.patch(id, { body: 'no auth' });
    expect(res.status()).toBe(401);
  });

  test('PATCH /comments/{id} with an unknown id returns 404', async ({ authApi }) => {
    const res = await authApi.comments.patch(`missing-${uniqueId()}`, { body: 'nobody home' });
    expect(res.status()).toBe(404);
  });

  test('PATCH /comments/{id} with an invalid date returns 422', async ({ authApi }) => {
    const { id } = await createOwnComment(authApi);
    const res = await authApi.comments.patch(id, { date: 'not-a-date' });
    expect(res.status()).toBe(422);
  });

  // DELETE /comments/{id}
  test('DELETE /comments/{id} removes an own comment (200)', async ({ authApi }) => {
    const { id } = await createOwnComment(authApi);
    const res = await authApi.comments.delete(id);
    expect(res.status()).toBe(200);

    const fetched = await authApi.comments.get(id);
    expect(fetched.status()).toBe(404);
  });

  test('DELETE /comments/{id} without auth is rejected with 401', async ({ api, authApi }) => {
    const { id } = await createOwnComment(authApi);
    const res = await api.comments.delete(id);
    expect(res.status()).toBe(401);
  });

  test('DELETE /comments/{id} with an unknown id returns 404', async ({ authApi }) => {
    const res = await authApi.comments.delete(`missing-${uniqueId()}`);
    expect(res.status()).toBe(404);
  });
});
