# GAD API tests (Playwright, API only)

No browsers are used, only Playwright's `APIRequestContext`.

## Run
```bash
# 1. Start the GAD server from the repo root (the npm "set VAR=1 &&" scripts are Windows-only)
PORT=3000 node server.js

# 2. In api-tests/
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install
npx playwright test          # or: npm test
npm run test:report          # open the HTML report
npm run check:guard          # no direct request.* / snapshot assertions in tests/
```

## Environment variables
| Var | Default | Purpose |
|---|---|---|
| `GAD_URL` | `http://localhost:3000` | Server base URL |
| `GAD_USER` / `GAD_PASSWORD` | `Moses.Armstrong@Feest.ca` / `test1` | Seed user for `authApi` |
| `COVERAGE_FILE` | `api-tests/.coverage/requests.jsonl` | Recorder output |
| `COVERAGE_APPEND` | unset | `1` = don't truncate the recorder file at start |

`globalSetup` calls `GET /api/restoreTestDB` (must return 201) and fails with a clear message if the server is down.

## Layout
`tests/*.spec.js` -> `src/fixtures.js` (`api`, `authApi`) -> `src/clients/*` -> `BaseClient.send()` -> `recorder`.
Tests never call `request.*` directly.

## Request recorder
Every client call appends one JSON line to `.coverage/requests.jsonl`:
```json
{"method":"GET","pathTemplate":"/api/articles/{id}","actualPath":"/api/articles/1","status":200,"queryParams":[],"bodyFields":[]}
```
`pathTemplate` is `/api` + the spec key from `public/tools/schema/openapi_rest_demo.json`; `status` is `null` on network errors.

## Caveats
- Single global in-memory DB: `workers: 1`.
- Runs dirty the git-tracked `db/db.json` (do not commit it).
- The server validates article dates in server-local time and rejects future dates; builders use "yesterday".
- Random 5xx (`randomErrorResponseProbability`) may cause rare flakiness.
- Current scope: login, articles and comments (list, get, create, unauthenticated create).
