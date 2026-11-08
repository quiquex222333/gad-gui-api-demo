# Plan 002 – Coverage tool

## Layout
```
coverage-tool/
  package.json            # CommonJS, "bin": {"gad-coverage": "bin/coverage.js"}, scripts: report, diff, test
  package-lock.json
  .gitignore              # node_modules/, out/
  coverage.config.json    # default scope/exclude (R6)
  README.md
  bin/coverage.js         # argv parsing (node:util parseArgs), exit codes, stdout/stderr
  src/
    paths.js              # repo root (= path.resolve(__dirname, '../..')), repo-relative normalisation
    config.js             # load + validate config, defaults
    glob.js               # glob → RegExp (§6)
    spec-loader.js        # swagger-parser dereference (external:false), extract operations/statuses/params
    matcher.js            # compile spec paths, match actualPath with precedence (§5)
    requests-loader.js    # read JSONL, classify lines, normalise
    analyze.js            # pure: (specModel, requests, config) → report object
    gaps.js               # pure: report → gaps[]
    diff.js               # pure: (baseReport, headReport) → diff object
    sort.js               # canonical comparators, method/type/in ranks
    format-console.js     # tables (pure string builders)
    write-json.js         # stable stringify + "\n"
  schema/report.schema.json  # spec §10, used by tests
  test/
    fixtures/  mini-openapi.json, requests-*.jsonl, base/head report pairs, expected/*.json
    *.test.js
```

## Design
- **Pure core, thin shell.** Only `bin/`, the loaders and `write-json.js` touch fs; `analyze`, `gaps`, `diff`, `format-console` are pure functions → easy golden tests, guaranteed determinism.
- **Spec model** (internal): `operations: Map<id, {method, path, statuses:Set<int>, params:[{in,name,required}]}>`. Built once; swagger-parser invoked as `SwaggerParser.dereference(parsedObject, { resolve: { external: false }, dereference: { circular: 'ignore' } })` on a copy parsed from the bytes read with `fs.readFileSync` (so hashing and parsing use the same bytes).
- **Matcher**: pre-split spec paths into segment arrays grouped by segment count; for a request, filter by count, test segments, reduce with the left-to-right literal-wins comparator; memoise by `actualPath`.
- **Aggregation**: counters keyed by item id (`Map`), converted to arrays and sorted with `sort.js` at the end — no reliance on insertion order of input.
- **Percent**: integer math as in spec §7; `round2` helper shared with diff.
- **Determinism guard**: no `Date`, `Math.random`, `os.EOL`, `localeCompare`, `process.cwd()` in outputs (cwd only to resolve user-given flags). A test greps `src/` for these tokens.
- **Version**: `tool.version` read from `coverage-tool/package.json`.

## Testing strategy (`node:test`, no extra deps)
- Unit: glob, matcher precedence (incl. `/surveys/...` tie case), requests classification, percent rounding, canonical sort.
- Golden: mini spec + jsonl fixtures → compare `report.json`/`gaps.json`/stdout byte-for-byte with `test/fixtures/expected/`.
- Determinism: run CLI twice in child processes with different `cwd`, `TZ`, `LANG`; compare bytes.
- Schema: validate generated report against `schema/report.schema.json` with a tiny in-test checker of required keys/`additionalProperties` (avoid adding Ajv as dependency) — or add `ajv` as **devDependency** only (decision in tasks T3).
- Real-repo smoke: run `report` against the real spec and current `requests.jsonl`; assert exit 0, global operations total = 170 minus excluded, and in-scope operations total = 26 (all ops under `/articles*`, `/comments*`, `/users*`, plus `GET`/`POST /login`; counted from the current spec).

## Risks
- swagger-parser may mutate/reorder: we never serialise its output directly; we extract into our own model and sort.
- Recorder format change in `api-tests` → `requests-loader` validates fields and reports INVALID_LINE instead of crashing.
- Spec typo path `/api/books/{id}` is kept as-is (outside default scope; appears in global as an uncovered op).
