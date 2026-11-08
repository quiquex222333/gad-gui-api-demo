# Tasks 001 – API Framework

Each task is small and verifiable. `Reqs` = spec requirement IDs.

| # | Task | Reqs | Done when |
|---|------|------|-----------|
| 1 | Scaffold `api-tests/package.json` (CommonJS, `@playwright/test` devDependency, scripts `test`, `test:report`, `check:guard`). | R1 | `npm install` succeeds; no browser download needed. |
| 2 | Add `api-tests/.gitignore` (`node_modules/`, `playwright-report/`, `test-results/`, `.coverage/`). | R11 | `git status` shows no generated files after a run. |
| 3 | `src/config.js` (GAD_URL default, seed creds, coverage path, `/api` prefix). | R2, R4 | `node -e "require('./src/config')"` prints expected defaults. |
| 4 | `playwright.config.js` (baseURL, `workers: 1`, reporters, globalSetup, no browser projects). | R2, R10, R11 | `npx playwright test --list` runs without error. |
| 5 | `src/recorder.js` (`record`, `reset`) + `tests/framework/recorder.spec.js`. | R8 | Test writes entries; each line is valid JSON; names sorted; `COVERAGE_FILE` override works. |
| 6 | `BaseClient.send` with path substitution and recording. | R5, R8 | Test shows `/api/articles/{id}` template with `/api/articles/1` actual path, query and body names recorded, `status: null` on network error. |
| 7 | `SystemClient.restoreTestDb` + `src/global-setup.js`. | R3 | Run fails with a clear message when the server is down; passes when up; jsonl is reset at start. |
| 8 | `LoginClient` + `tests/login.spec.js` (200 token, 401 bad credentials, `GET /login` 200 with token / 401 without). | R5, R7 | Spec passes. |
| 9 | Fixtures `api` / `authApi` (worker-scoped token). | R4 | Smoke test uses both; `authApi` passes `GET /api/login` → 200, `api` → 401. |
| 10 | Builders + `unique.js`. | R6 | Two consecutive builds yield distinct values; overrides respected. |
| 11 | `ArticlesClient` + `articles.spec.js` (create/get/put/patch/delete/head happy path, unauth POST 401, missing id 404, missing title 422). | R5, R7, R13 | Spec passes. |
| 12 | `CommentsClient` + `comments.spec.js` (create on a new article, get, patch, delete, unauth 401). | R5, R7 | Spec passes. |
| 13 | `UsersClient` + `users.spec.js` (register 201, duplicate email 409, missing id 404, patch own 200). | R5, R7 | Spec passes. |
| 14 | `tests/framework/path-templates.spec.js`: each client `PATHS` value minus `/api` is a key in `public/tools/schema/openapi_rest_demo.json` (allowlist `/api/restoreTestDB`). | R9 | Spec passes; fails if a typo'd template is introduced. |
| 15 | `scripts/check-no-direct-request.js`: fails on `request.(get|post|put|patch|delete|head|fetch)` and `toMatchSnapshot` in `tests/`. | R5, R7 | `npm run check:guard` exits 0; exits 1 on a planted violation. |
| 16 | Recorder end-to-end check (`npm run verify:coverage` or final framework test): every line parses and has all 6 fields; count matches client calls. | R8 | Passes after a full run. |
| 17 | `README.md` (start server on Linux, env vars, run, report, recorder format, caveats). | R12 | A new user can run the suite following only the README. |

## Order & dependencies
1→2→3→4 (scaffold) → 5→6 (recorder/base) → 7 (setup) → 8→9 (auth/fixtures) → 10 → 11→12→13 (resources) → 14→15→16 (guards) → 17.
