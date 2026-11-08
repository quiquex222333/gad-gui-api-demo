# coverage-tool

Deterministic API coverage for the GAD OpenAPI spec. It reads the spec and the requests recorded by
`api-tests` (`api-tests/.coverage/requests.jsonl`) and reports how much of the spec the suite exercises.
No network, no clock, no randomness: same inputs give byte-identical outputs.

Design: `specs/002-coverage-tool/` (`spec.md`, `plan.md`, `tasks.md`).

## Setup

```bash
cd coverage-tool && npm ci      # Node >= 20; one runtime dependency (@apidevtools/swagger-parser)
npm test                        # node:test, no extra dependencies
```

## Typical flow

```bash
# 1. start the app and run the API suite (records requests.jsonl)
PORT=3005 node server.js &
(cd api-tests && npm test)

# 2. compute coverage (from the repo root)
npm run coverage:report                       # writes coverage-tool/out/report.json + gaps.json
npm run coverage:report -- --out-dir docs/day2-baseline

# 3. compare two reports
npm run coverage:diff -- base/report.json head/report.json
npm run coverage:diff -- base/report.json head/report.json --out diff.json --fail-on-opened
```

Inside `coverage-tool/` the same commands are `npm run report` / `npm run diff -- <base> <head>`,
or `node bin/coverage.js <command>`.

## Commands and flags

`report`

| Flag | Default |
|------|---------|
| `--spec <file>` | `public/tools/schema/openapi_rest_demo.json` |
| `--requests <file>` | `api-tests/.coverage/requests.jsonl` |
| `--config <file>` | `coverage-tool/coverage.config.json` (built-in defaults if the file is absent) |
| `--out-dir <dir>` | `coverage-tool/out` |

Writes `report.json` and `gaps.json`, prints a console summary, and prints warnings to stderr.

`diff <base.json> <head.json>`

| Flag | Effect |
|------|--------|
| `--out <file>` | also write `diff.json` |
| `--fail-on-opened` | exit 1 if any gap was opened (an item covered in base is uncovered in head) |

Both inputs must be `report.json` files with `schemaVersion` major 1. Missing or null `summary.global`
is tolerated; its deltas are reported as `n/a`.

Exit codes: `0` success, `1` regression (`diff --fail-on-opened` only), `2` usage or input error.
Coverage level never changes the exit code of `report`.

## Config

```json
{ "scope": ["/articles*", "/comments*", "/users*", "/login"], "exclude": ["/restore*", "/debug/*"] }
```

Globs: `*` matches any characters including `/`; everything else is literal; whole-string match.
`exclude` wins over `scope` and removes operations and requests from every total, list and gap.
`global` = all non-excluded operations; `scope` = global limited to the `scope` globs.

## What is measured

| Dimension | Item | Covered when |
|-----------|------|--------------|
| operations | each documented `METHOD path` | at least one counted request |
| statuses | each (operation, documented numeric status) | at least one counted request with that status |
| parameters | each (operation, path/query/body param) | path: operation covered; query/body: name seen in a request |

Only lines with `source: "test"` and a non-null status are counted; setup/fixture calls are ignored.
The tool derives the spec path itself (most specific template wins: `/articles/search` beats
`/articles/{id}`) and never trusts the recorder's `pathTemplate`; a difference is reported as
`PATH_TEMPLATE_MISMATCH`.

**Drift** lists traffic the spec does not describe (unmatched requests, undocumented statuses and
parameters). It never changes coverage totals.

## Output files

| File | Content |
|------|---------|
| `report.json` | full report, validated by `schema/report.schema.json` |
| `gaps.json` | documented items with zero requests (operation, status, param), canonical order |
| `diff.json` | per-dimension deltas, closed/opened/added/removed gaps, drift changes |

## Determinism guarantees

- No timestamps, durations, hostnames, absolute paths or random values in any output.
- Paths in outputs are repo-relative with `/` separators; hashes are sha256 of the raw input bytes.
- Strings are compared by code unit (never `localeCompare`); one canonical sort order everywhere.
- Output is `JSON.stringify(x, null, 2) + "\n"`; console output has no colours and `\n` endings.
- Tests run the CLI twice with different cwd, `TZ` and `LANG` and compare bytes, and grep `src/`
  for clock, random, locale and network usage.

## Tests

`npm test` runs unit tests, byte-for-byte golden tests (`test/fixtures/expected/`), CLI/exit-code tests,
diff tests, schema validation, determinism and a smoke test on the real repo. After an intentional
output change, regenerate the goldens with `npm run update-golden` and review the diff.
