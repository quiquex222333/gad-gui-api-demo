# Tasks 002 – Coverage tool

| # | Task | Reqs | Done when |
|---|------|------|-----------|
| 1 | Scaffold `coverage-tool/` (`package.json` CommonJS, pinned `@apidevtools/swagger-parser`, scripts `report`/`diff`/`test`; `.gitignore`). | R1, R14 | `npm ci` ok; `node bin/coverage.js --help` exits 0. |
| 2 | `sort.js`, `write-json.js`, `paths.js`. | R11 | Unit tests: canonical order; output ends with single `\n`; repo-relative `/` paths. |
| 3 | `schema/report.schema.json` (copy of spec §10) + validation helper (decide: Ajv devDependency vs. minimal checker). | R9 | Fixture report validates; a report with an extra key fails. |
| 4 | `config.js` + `glob.js` + default `coverage.config.json`. | R6 | Tests: `/articles*` matches `/articles/{id}`, `/debug/*` matches `/debug/x/y`, exclude wins, missing file → defaults, bad shape → exit 2. |
| 5 | `spec-loader.js` (dereference, operations, numeric statuses, path/query/body params, header ignored). | R2, §4.2 | Real spec → 170 operations; `POST /articles` body params = body,date,image,title; non-numeric key fixture → warning. |
| 6 | `matcher.js` (§5). | R5 | Tests: `/articles/search`→literal, `/articles/7`→`{id}`, `/surveys/statistics/description`→`/surveys/statistics/{type}`, unknown→no-path, wrong method→no-method. |
| 7 | `requests-loader.js` (classification, normalisation, `PATH_TEMPLATE_MISMATCH`, `INVALID_LINE`). | R4, R5 | Line buckets match fixture counts; only `source:"test"` counted. |
| 8 | `analyze.js` → report object (dimensions scope/global, operations, drift, warnings). | R7, R8 | Golden `report.json` for mini fixture matches byte-for-byte; `DELETE /articles/1 → 404` in drift. |
| 9 | `gaps.js` → `gaps.json`. | R9, §11 | Golden `gaps.json` matches; ids unique; order canonical. |
| 10 | `format-console.js` + `report` command in `bin/coverage.js` (flags, exit codes, stderr warnings). | R3, R9, R12 | Golden stdout matches; missing requests file → exit 2. |
| 11 | `diff.js` + `diff` command (`--out`, `--fail-on-opened`). | R10, R13 | Self-diff all zero/empty; fixture pair → expected closed/opened/added/removed; major mismatch → exit 2. |
| 12 | Determinism test (two runs, different cwd/TZ/LANG) + source grep for `Date`/`Math.random`/`localeCompare`/`os.EOL`/`http`/`fetch`. | R2, R11 | Test passes. |
| 13 | Real-repo smoke test against current spec + `api-tests/.coverage/requests.jsonl`. | §14 | Exit 0; report validates. |
| 14 | `README.md`. | R15 | A new user can run `report` and `diff` from the README alone. |

## Order
1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14.
