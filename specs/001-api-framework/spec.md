# Spec 001 – GAD API Test Framework (`api-tests/`)

Source of facts: `docs/discovery.md`. Status: **draft, awaiting approval**.

## 1. Goals
- A reliable, readable API regression suite for the GAD REST API using Playwright Test (API only).
- First resources: login, articles, comments, users.
- Produce a machine-readable request log (`api-tests/.coverage/requests.jsonl`) so a later tool can compute coverage against `public/tools/schema/openapi_rest_demo.json`.

## 2. Non-goals
- Browser/UI tests.
- Starting or stopping the GAD server (the user runs it; an optional `webServer` is deferred).
- Modules other than login/articles/comments/users (GAD Talk, Learning, book-shop, games…).
- Fixing spec/server mismatches (discovery §7); tests assert real behaviour.
- Schema validation (Ajv), the coverage tool itself, parallel execution, CI pipeline.

## 3. Requirements

| ID | Level | Requirement |
|----|-------|-------------|
| R1 | MUST | Standalone `api-tests/` with its own `package.json`; only `@playwright/test` as test dependency. CommonJS (`require`/`module.exports`), plain JS, matching the repo. No browsers installed or used; only the `request` fixture / `APIRequestContext`. |
| R2 | MUST | `baseURL` from env `GAD_URL`, default `http://localhost:3000`. Clients prefix paths with `/api`. |
| R3 | MUST | `globalSetup` calls `GET /api/restoreTestDB`, asserts **201**, and fails the run otherwise. It also resets the recorder file (unless `COVERAGE_APPEND=1`). |
| R4 | MUST | Custom fixtures: `api` (unauthenticated clients) and `authApi` (clients sending `Authorization: Bearer <token>` obtained from `POST /api/login` as a seed user; default `Moses.Armstrong@Feest.ca` / `test1`, overridable via `GAD_USER` / `GAD_PASSWORD`). |
| R5 | MUST | One thin client per resource (`LoginClient`, `ArticlesClient`, `CommentsClient`, `UsersClient`, `SystemClient`) on a shared `BaseClient`. Tests never call `request.get/post/put/patch/delete/head/fetch` directly (enforced by a guard script, see tasks). |
| R6 | MUST | Data builders generate unique values per test (`uniqueId()` = timestamp + worker index + counter); any field overridable. |
| R7 | MUST | Assertions: status code first, then key body fields. No snapshot assertions. |
| R8 | MUST | **Request recorder** (critical). Every client call appends exactly one JSON line to `api-tests/.coverage/requests.jsonl`, see §4. |
| R9 | MUST | Every `pathTemplate` used by clients, minus the `/api` prefix, is a key in `openapi_rest_demo.json`, verified by a self-check test. Allowlist for undocumented routes: `/api/restoreTestDB`. |
| R10 | SHOULD | `workers: 1`, `fullyParallel: false` (single global in-memory DB). |
| R11 | SHOULD | `list` + `html` reporters; `api-tests/.gitignore` covers `node_modules/`, `playwright-report/`, `test-results/`, `.coverage/`. |
| R12 | SHOULD | README with run instructions (`PORT=3000 node server.js`; the npm `set VAR=1 &&` scripts are Windows-only). |
| R13 | SHOULD | Where the server deviates from the spec (e.g. `DELETE /articles/{id}` → 404), assert real behaviour with a comment citing discovery §7. |

## 4. Recorder format (R8)

One line per client call, e.g.:

```json
{"method":"GET","pathTemplate":"/api/articles/{id}","actualPath":"/api/articles/1","status":200,"queryParams":["_limit"],"bodyFields":["title","body"]}
```

- `method`: uppercase HTTP verb.
- `pathTemplate`: `"/api"` + the **exact spec path key** (same `{param}` names), e.g. `/api/articles/{id}`. The coverage tool strips `servers[0].url` (`/api`) to match spec keys. *(Decision confirmed by the user.)*
- `actualPath`: path actually requested, with `/api` prefix, no host, no query string.
- `status`: HTTP status; `null` on network error (the entry is still written, then the error is rethrown).
- `queryParams`: sorted array of query parameter **names**.
- `bodyFields`: sorted array of top-level JSON body keys; `[]` if no body.
- Recorded even if later assertions fail; file and directory auto-created; append-only writes (safe with more than one worker).
- Templates are constants in each client, never derived from the URL.

## 5. Acceptance criteria
1. With the server running, `cd api-tests && npm ci && npx playwright test` passes.
2. `requests.jsonl` contains one valid JSON line per client call, matching §4.
3. `grep` guard finds zero direct `request.*` calls and zero snapshot assertions in `tests/`.
4. Self-check (R9) passes.

## 6. Open items / assumptions
- Default seed user is user id 1; if the DB is restored with another file, creds may differ.
- Random-error routes (`randomErrorResponseProbability: 0.05`) and bug flags are **UNVERIFIED** as enabled by default; if flaky 5xx appear, note in README.
- `db/db.json` is git-tracked and may be dirtied by runs.
