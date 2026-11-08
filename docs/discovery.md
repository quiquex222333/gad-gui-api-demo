# GAD API – Discovery Report (for `api-tests/` Playwright framework)

Scope: read-only exploration. Every claim cites a file path. Items not confirmed are marked **UNVERIFIED**.
Nothing was executed against a running server (static analysis + loading the spec JSON with Node).

---

## 1. Server start, port, env flags

- Entry point: `server.js` (`npm start` → `node server.js`, `package.json` scripts). Uses the bundled `json-server/` + Express. REST router is mounted at `/api` (`server.js`: `server.use("/api", router)`).
- Port: `process.env.PORT || defaultPort`; `defaultPort: 3000` (`server.js:68`, `config/config-general.js`). A WebSocket server also starts on `PORT + 10` (`server.js:69`).
- `READ_ONLY=1` → `config.readOnly = true` (`config/config-general.js:87`). Any non-GET reaching the validation middleware returns **405** `"Method not allowed in READ ONLY MODE"` (`routes/validations.route.js:155-159`).
- `DB=<name>` → `config.dbCustomPath` (`config/config-general.js:67`). At startup `overwriteDbIfDefined()` copies `./db/<name>.json` over `./db/db.json` (`db/migrators/migrator.js:65-86`, invoked from `server.js`).
- `SSL_ENABLED=1` → HTTPS using `certs/ca-key.pem` / `certs/ca-cert.pem` (`config/config-general.js:88`, `server.js` SSL block).
- Live DB: `./db/db.json` (`dbPath`, `config/config-general.js`). Created from `db/db-base.json` if missing (`helpers/setup.js`). **`db/db.json` is git-tracked** (`git ls-files db`), so test runs can dirty the working tree (state is also kept in memory; persistence to the file is done by json-server/lowdb – exact write timing **UNVERIFIED**).
- Gotcha: `start3001` / `start:readonly` / `start:ssl` use Windows `set VAR=1 && node …` (`package.json`) – they do not set env vars on Linux/macOS. Use `PORT=3003 READ_ONLY=0 node server.js` instead (or `cross-env`).
- Other feature flags/bugs are toggled via config (`config/config-features.js`, `config/config-bugs.js`) – not covered here.

## 2. OpenAPI spec

- File: `public/tools/schema/openapi_rest_demo.json`
- Format/version: **OpenAPI 3.0.1** (`openapi` field), `info.version` = 1.3.3.
- Size: **136 paths, 170 operations** (counted by loading the JSON with Node).
- `servers`: `/api` and `http://localhost:3000/api`. Security scheme: `bearerAuth` (`type: http`, `scheme: bearer`). Note: path keys are relative to `/api` (e.g. `/articles`).
- Served at:
  - `GET /api/openapi.json` and `GET /api/schema` → returns the same JSON (`routes/custom.route.js:28, 256-258`).
  - Static file `/tools/schema/openapi_rest_demo.json` (`public/tools/schema/`), used by Swagger UI (`public/swagger/swagger-initializer.js`: `url: "../tools/schema/openapi_rest_demo.json"`). Swagger UI pages: `/tools/swagger.html`, `/swagger/`.
- It is a **single static file** – not split, not generated at runtime. To obtain a spec file: `curl http://localhost:3000/api/openapi.json -o openapi.json` (or copy the file above).
- Other, separate specs in the same folder (modules, out of scope): `openapi_gadtalk.json`, `openapi_learning.json`, `openapi_weatherApp.json`, `openapi_weatherApp copy.json`.

## 3. Authentication

- Login: `POST /api/login` with JSON `{ "email", "password", "keepSignIn"? }` (`routes/login.route.js` `loginApiRoutes`; route registered in `server.js`).
  - 200 → `{ "access_token": "<jwt>" }`
  - 401 → `{ "status": 401, "message": "Incorrect email or password" }`
- Token: JWT signed with `jsonwebtoken`, secret `"123456789"` (`config/config-general.js:15`, `helpers/jwtauth.js` `createToken`), payload `{ email, data: "TBD" }`. Expiry `60m` (`tokenExpiresIn`), `7200m` with `keepSignIn` (`config/config-general.js:24-26`). Algorithm = library default (HS256) – **UNVERIFIED** (not set explicitly).
- Sent as header `Authorization: Bearer <token>` (server does `authorization.split(" ")[1]`, `helpers/validation.helpers.js:316-322`). Validate a token with `GET /api/login` (`routes/login.route.js` `loginValidateRoutes`); missing/invalid → 401.
- Credentials from seed DBs (same first rows in `db/db-base.json`, `db/db-base-test.json`, `db/db.json`; 15 users each):

  | id | email | password |
  |----|-------|----------|
  | 1 | `Moses.Armstrong@Feest.ca` | `test1` |
  | 2 | `Danial.Dicki@dicki.test` | `test2` |
  | 3 | `Daryl.Parisian@gmail.test` | `5Eleanore90` |
  | 4 | `Dortha.Blick@Walker.name` | `5Damien43` |

  Super-admin: `admin` / `admin` (`config/config-general.js:5-6`, `helpers/helpers.js:84-85`).
- Email comparison is case-insensitive; users with `_inactive: true` cannot log in (`helpers/jwtauth.js` `isAuthenticated`).
- A bug flag `BUG_DISABLE_MODULE_AUTH` makes login fail / token verification error when enabled (`helpers/jwtauth.js`); default value **UNVERIFIED** (see `config/config-bugs.js`).

## 4. Database reset / restore (test isolation)

Defined in `server.js` (`clearDbRoutes`, ~lines 105-170). All are `GET`, success = **201** `{ message, entities }`; replaces in-memory DB state via `router.db.setState(...)`.

| Endpoint | Source file |
|---|---|
| `GET /api/restoreDB` | `db/db-base.json` |
| `GET /api/restoreTestDB` | `db/db-base-test.json` (used by existing mocha suite) |
| `GET /api/restoreDB2` | `db/db-base-v2.json` |
| `GET /api/restoreBigDB` | `db/db-base-big.json` |
| `GET /api/restoreTinyDB` | `db/db-base-tiny.json` |
| `GET /api/restoreEmptyDB` | `db/db-empty.json` |
| `GET /api/restoreInterviewDB` | `db/db-base-interview.json` |
| `GET /api/restore/list` | lists the above (returns 201) |

- Unknown restore name containing "DB" → 404 `"No action for restore"`.
- Reset is **global** (single in-memory DB). With Playwright parallel workers, tests will interfere; use `workers: 1` or per-test unique data.
- Learning module has its own: `GET /api/learning/system/restore` (200) (`tests/config.js:78`, `tests/hooks.js`); handler file not inspected – **UNVERIFIED**.
- `/api/restoreEmptyDB` + users: empty DB has no users, so login would fail afterwards – content of `db/db-empty.json` users **UNVERIFIED**.

## 5. Recommended first resources: articles, comments, users (+ login helper)

Documented status codes from `public/tools/schema/openapi_rest_demo.json` (🔒 = `bearerAuth`). Handlers: `endpoints/articles-endpoint.helpers.js`, `endpoints/comments-endpoint.helpers.js`, `endpoints/users-endpoint.helpers.js`, dispatched from `routes/validations.route.js`.

**Articles**

| Method | Path | Documented codes |
|---|---|---|
| GET | `/articles` | 200 |
| POST 🔒 | `/articles` | 201, 400, 401, 422 |
| GET | `/articles/{id}` | 200, 404 |
| PUT 🔒 | `/articles/{id}` | 200, 201, 400, 401, 404, 422 |
| PATCH 🔒 | `/articles/{id}` | 200, 400, 401, 404, 422 |
| DELETE 🔒 | `/articles/{id}` | 200, 400, 401 |
| HEAD | `/articles/{id}` | 200, 400, 404 |

**Comments**

| Method | Path | Documented codes |
|---|---|---|
| GET | `/comments` | 200 |
| POST 🔒 | `/comments` | 201, 400, 401, 422 |
| GET | `/comments/{id}` | 200, 400, 404 |
| PUT 🔒 | `/comments/{id}` | 200, 201, 400, 401, 404, 422 |
| PATCH 🔒 | `/comments/{id}` | 200, 400, 401, 404, 422 |
| DELETE 🔒 | `/comments/{id}` | 200, 401, 404 |
| HEAD | `/comments/{id}` | 200, 400, 404 |

**Users**

| Method | Path | Documented codes |
|---|---|---|
| GET | `/users` | 200 |
| POST | `/users` (no auth) | 201, 400, 409, 422 |
| GET | `/users/{id}` | 200, 400, 404 |
| PUT 🔒 | `/users/{id}` | 200, 201, 400, 401, 404, 422 |
| PATCH 🔒 | `/users/{id}` | 200, 400, 401, 404, 422 |
| DELETE 🔒 | `/users/{id}` | 200, 401, 404 |
| HEAD | `/users/{id}` | 200, 400, 404 |

**Login (needed for all 🔒 calls)**: `POST /login` → 200, 401; `GET /login` 🔒 → 200, 401.

Behavioural notes (from code):
- Handlers also emit **422** for validation errors, **409** for users conflicts (`HTTP_CONFLICT` in `endpoints/users-endpoint.helpers.js`).
- Deleting an article soft-deletes its comments; with bug flag `BUG_DELAY_SOFT_DELETE_COMMENTS` this is delayed by 3 s (`server.js` soft-delete middleware; `config/config-general.js` `commentsSoftDeleteDelayInSecondsBug`). Deleting a user soft-deletes related articles/comments only if `FEATURE_SOFT_DELETE_USERS` is true (default **UNVERIFIED**).
- Random 500-ish errors: `randomErrorsRoutes` (`routes/error.route.js`) with `randomErrorResponseProbability: 0.05` in `config/config-general.js` – whether enabled by default is **UNVERIFIED**; check before asserting strict status codes.
- Captcha handling (`handleCaptchaVerification` in `routes/validations.route.js`) runs before resource handlers – whether it affects article/comment/user POSTs by default is **UNVERIFIED**.
- Ownership: non-admin users can only modify their own articles/comments (`endpoints/articles-endpoint.helpers.js` ~lines 322-341 → 401 via `formatInvalidTokenErrorResponse`).

## 6. Existing `tests/` and `test-vitest/`

**`tests/`** (Mocha + Chai + Supertest, also a `jest` script) – `tests/package.json`
- 33 entries in `tests/test/` (articles, users, comments, login, likes, labels, health, surveys, book-shop/, learning/, practice/, units/ …).
- Imports `../server.js` **in-process** (`tests/config.js:1`) with `PORT=3002` via `cross-env` (`tests/package.json` scripts).
- Hooks (`tests/hooks.js`): `beforeAll` → `GET /api/restoreTestDB` expects 201 and learning restore expects 200; `afterAll` → `GET /api/debug/exit` after 1 s (kills the server).
- Own `package.json`, `package-lock.json`, `node_modules` (not shared).
- `tests/tools/schema-validator.mjs` validates the OpenAPI doc (`test-schema` script; file not opened – **UNVERIFIED**).

**`test-vitest/`** (Vitest, ESM) – `test-vitest/package.json`, `vitest.config.js`
- Global setup `tests/setup.js` starts the server; default `TEST_SERVER_PORT` = **3002** (`test-vitest/config.js:14`, `env.example`). Files run serially, `isolate: false` (`vitest.config.js`).
- Focus: gad-talk, learning, healthcheck.

**Conflict assessment for a new `api-tests/` project**
- Root `package.json` has no `workspaces` and no Playwright config/dependency found (`grep workspaces package.json` → none; no `playwright.config.*` at root) → a standalone `api-tests/package.json` is safe.
- Port clash: both existing suites use **3002**; choose another port for Playwright (e.g. 3003/3005) and remember WS port = PORT+10.
- Shared DB: all suites mutate the same `db/db.json`/in-memory state of whichever server instance they target; do not run concurrently against one instance.
- `tests/hooks.js` calls `/api/debug/exit` – don't point it at the same server used by Playwright.
- Root lint/format configs (`.eslintrc.json`, `.prettierrc.json`, `.eslintignore`, `.prettierignore`) will apply to `api-tests/` when run from the root (`npm run eslint` / `pretty`).
- Root `.gitignore` ignores `node_modules`, `reports`, `results`, `logs`; it does **not** list `playwright-report/` or `test-results/` – add them in `api-tests/.gitignore`.
- Dependency checker: `assertPackageDependencies()` runs on server start (`server.js:1-3`, `helpers/package.checker.js`); server needs root `npm install`, not `api-tests` deps.

## 7. Spec vs real routes – mismatches (list only, not fixed)

1. `GET /restore/list`: spec documents **200** (`public/tools/schema/openapi_rest_demo.json`), server replies **201** (`server.js` `clearDbRoutes`).
2. Spec documents only `/restoreDB`, `/restoreEmptyDB`, `/restoreBigDB`; server also supports `/restoreDB2`, `/restoreTinyDB`, `/restoreTestDB`, `/restoreInterviewDB` (`server.js`).
3. Spec path `/api/books/{id}` (only `patch`) with server base `/api` would resolve to `/api/api/books/{id}` – looks like a spec path typo (`openapi_rest_demo.json`).
4. `DELETE /articles/{id}` can return **404** (`endpoints/articles-endpoint.helpers.js:329-331`) but the spec lists only 200, 400, 401.
5. Restore routing is a substring match on `req.url` containing `restore` and `DB` (`server.js` `clearDbRoutes`), so it is not limited to `/api/restore*` paths.
6. `/openapi.json` is served regardless of HTTP method (`routes/custom.route.js:256` – the `||` branch has no method check), while the spec documents only GET.
7. Spec contains `/restoreDB`-style, `/debug/*` and many game endpoints; whether every documented path has a matching handler, and every handler under `endpoints/` (book-shop, gad-talk, bug-hatch, practice, learning, challenges, teams, projects, user-roles…) is in this spec, was **not diffed** – **UNVERIFIED**. (GAD Talk and Learning have their own specs.)
8. Spec documents `/surveys/...`, `/bookmarks/articles`, etc.; actual response codes for these were **not compared** – **UNVERIFIED**.

---

### Suggested next steps for `api-tests/` (not done here)
- Start server with `PORT=3005 node server.js` (do not rely on the Windows-only npm scripts), `baseURL=http://localhost:3005/api/`.
- Playwright `globalSetup`: `GET /restoreTestDB`; fixture: `POST /login` → bearer token; `workers: 1` initially.
- Download the spec from `/api/openapi.json` for schema validation (e.g. Ajv).
