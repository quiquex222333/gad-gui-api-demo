# API test conventions

Derived from the code in `api-tests/`. If code and this doc disagree, the code wins — then fix the doc.

## 1. Folder structure
- `tests/` — feature specs, one per resource (`articles.spec.js`, `login.spec.js`).
- `tests/framework/` — self-tests of the harness (recorder, `BaseClient`, client paths vs. OpenAPI). No feature tests.
- `src/` — `config.js` (env + defaults), `fixtures.js` (`api`, `authApi`), `global-setup.js` (restore DB), `recorder.js`.
- `src/clients/` — one client per resource, all extend `BaseClient`; registered in `index.js` (`createClients`).
- `src/builders/` — payload factories; `unique.js` provides `uniqueId()`.
- `scripts/` — `check-no-direct-request.js` guard (`npm run check:guard`).
- `.coverage/` — recorder output (`requests.jsonl`), gitignored.

## 2. Naming
- Specs: `<resource>.spec.js`. `zz-` prefix only for specs that must run last (`zz-coverage-file.spec.js`).
- `test.describe('<Resource>')`, capitalised, one per spec file.
- Test titles: `<METHOD> /<path> <expected behaviour>`, e.g. `POST /articles without auth is rejected`.
- Clients: file `<resource>.client.js`, class `<Resource>Client`, a `PATHS` constant exported as `module.exports.PATHS`.
  Methods: `list`, `get`, `create`, `put`, `patch`, `delete`, `head`. Key in `createClients`: plural resource (`api.articles`).
- Builders: file `<resource>.builder.js`, function `build<Resource>(overrides = {})` (reference: `article.builder.js`).

## 3. Fixtures
Import `{ test, expect }` from `../src/fixtures`. Use plain `@playwright/test` only in `tests/framework/` and `zz-` specs that hit no server.
- `api` — unauthenticated. Public reads and negative auth cases (expect 401).
- `authApi` — Bearer token of the seed user (worker-scoped login in `fixtures.js`). Any write or authenticated read.
- Use both in one test to compare auth vs. no auth (see `login.spec.js`, `validate`).

## 4. Assertion style
Assert the exact status first, then the body fields against the payload you sent, then read back via GET.

```js
// Correct
expect(res.status()).toBe(201);
const body = await res.json();
expect(body.title).toBe(payload.title);
```
```js
// Incorrect: vague, passes on any 2xx, checks nothing about the data
expect(res.ok()).toBeTruthy();
expect(res.status()).toBeLessThan(500);
```
Snapshot assertions (`toMatchSnapshot`, `toHaveScreenshot`) are banned by the guard.

## 5. Request recorder
`BaseClient.send()` is the single choke point for HTTP. Each call appends one JSON line to `.coverage/requests.jsonl`
(`method`, `pathTemplate`, `actualPath`, `status`, `queryParams`, `bodyFields`) — even if the request throws (`status: null`).
This file is how endpoint coverage against `public/tools/schema/openapi_rest_demo.json` is measured.
- A request that bypasses a client is invisible to coverage. **Every new endpoint must go through a client method.**
- `pathTemplate` = `/api` + the OpenAPI path key (e.g. `/api/articles/{id}`). Path constants live in the client's `PATHS`.
- `tests/framework/path-templates.spec.js` verifies each `PATHS` entry exists in the spec; add new clients to its `clients` map.

## 6. How to add a test for a new endpoint
1. Find the path/method in `public/tools/schema/openapi_rest_demo.json`.
2. Add the path to the resource client's `PATHS` (or create `src/clients/<resource>.client.js` extending `BaseClient`).
3. Add a method that only calls `this.send(METHOD, PATHS.x, { pathParams, params, data })`.
4. New client? Register it in `src/clients/index.js` (`createClients` + exports).
5. Add the client's `PATHS` to `tests/framework/path-templates.spec.js`.
6. Add or extend a builder in `src/builders/` (unique data via `uniqueId()`, accept `overrides`).
7. Write the spec in `tests/<resource>.spec.js` using `api` or `authApi`.
8. Run `npm test` and `npm run check:guard`.

Canonical example (`tests/articles.spec.js`):
```js
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
```

## 7. Don'ts
- No raw `request.get/post/put/patch/delete/head/fetch` in `tests/` — use a client (guard fails the check).
- No hardcoded IDs. Create the resource and use the returned `body.id`.
  (`get(1)` in the current list/get tests relies on seed data; do not copy it for new tests.)
- No shared mutable data between tests. One in-memory DB and `workers: 1`: every test builds its own payload with a builder.
- Never weaken an assertion to make a known bug pass (no loosened status, no dropped field checks). Keep the correct
  expectation and let the test fail visibly, or mark it with `test.fail`/`test.fixme` plus a comment naming the bug.
