# Plan 001 – Architecture & Layout

Implements `spec.md` (R1–R13).

## 1. Layers

```
tests/*.spec.js
   └─ fixtures (api, authApi)            src/fixtures.js
        └─ resource clients              src/clients/*.client.js
             └─ BaseClient.send()        src/clients/base.client.js
                  ├─ APIRequestContext.fetch()
                  └─ recorder.record()   src/recorder.js
```

## 2. Key components

**`src/config.js`** – `GAD_URL` (default `http://localhost:3000`), seed creds (`GAD_USER`/`GAD_PASSWORD`), `COVERAGE_FILE` (default `<api-tests>/.coverage/requests.jsonl`, resolved from `__dirname`, not cwd), `API_PREFIX = '/api'`.

**`BaseClient.send(method, pathTemplate, { pathParams, params, data, headers })`**
1. Substitute `{name}` in `pathTemplate` from `pathParams` (`encodeURIComponent`) → `actualPath`.
2. `await this.request.fetch(actualPath, { method, params, data, headers })` (try/catch to capture network errors).
3. `recorder.record({ method, pathTemplate, actualPath, status, queryParams: Object.keys(params||{}).sort(), bodyFields: isPlainObject(data) ? Object.keys(data).sort() : [] })`.
4. Return the `APIResponse` (rethrow after recording on error).

Each client declares `PATHS` constants already in final form, e.g. `{ list: '/api/articles', item: '/api/articles/{id}' }`.

**Clients** – thin methods only, return `APIResponse`:
- `LoginClient`: `login(email, password)`, `validate()` (`GET /api/login`).
- `ArticlesClient`: `list`, `get`, `create`, `put`, `patch`, `delete`, `head`.
- `CommentsClient`: same shape on `/api/comments`.
- `UsersClient`: same shape on `/api/users`.
- `SystemClient`: `restoreTestDb()` (`GET /api/restoreTestDB`).

**`src/recorder.js`** – `record(entry)` = `mkdirSync(dir,{recursive:true})` + `appendFileSync(file, JSON.stringify(entry)+'\n')`; `reset()` truncates the file.

**`src/fixtures.js`** (`test.extend`)
- worker-scoped `authToken`: `POST /api/login` once per worker with seed creds.
- `api`: `{ login, articles, comments, users, system }` on the built-in `request` context.
- `authApi`: same bundle on `playwright.request.newContext({ baseURL, extraHTTPHeaders: { Authorization: 'Bearer <token>' } })`, disposed on teardown.

**`src/global-setup.js`** – `recorder.reset()` (unless `COVERAGE_APPEND=1`) → new context → `SystemClient.restoreTestDb()` → assert 201 with a clear message if server unreachable.

**Builders** (`src/builders/`) – `uniqueId()`; `buildArticle(o)` → `{title, body, date, image}`; `buildComment({article_id, ...o})` → `{article_id, body, date}`; `buildUser(o)` → `{email: qa+<uid>@example.test, firstname, lastname, password, avatar}`.

**`playwright.config.js`** – `testDir: 'tests'`, `use.baseURL`, `globalSetup`, `workers: 1`, `fullyParallel: false`, reporters `list` + `html`, no browser `projects`.

## 3. Folder layout

```
api-tests/
  package.json
  playwright.config.js
  .gitignore
  README.md
  scripts/check-no-direct-request.js
  src/
    config.js
    recorder.js
    fixtures.js
    global-setup.js
    clients/  base.client.js login.client.js articles.client.js
              comments.client.js users.client.js system.client.js index.js
    builders/ unique.js article.builder.js comment.builder.js user.builder.js
  tests/
    framework/ recorder.spec.js path-templates.spec.js
    login.spec.js articles.spec.js comments.spec.js users.spec.js
  .coverage/requests.jsonl      (generated, gitignored)
```

## 4. Decisions
- CommonJS + plain JS: root repo is CommonJS (no `"type"`), so no TS/ESM build step.
- Guard against direct `request.*` via a small Node script (no ESLint dependency added to `api-tests/`).
- pathTemplate = `/api` + spec key (user decision).
- Single worker; unique data per test as a second defence.

## 5. Risks
| Risk | Mitigation |
|------|-----------|
| Global shared DB | `workers: 1`, restore in globalSetup, unique data |
| Random 5xx / bug flags | Documented in README; restore before run |
| Windows-only npm scripts | README uses plain env vars |
| `db/db.json` tracked by git | README note; do not commit DB changes |
| Existing suites use port 3002 | Default 3000; user may pick e.g. 3005 via `GAD_URL` (WS = PORT+10) |
