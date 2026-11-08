# Spec 002 – Deterministic API Coverage Tool (`coverage-tool/`)

Sources: `docs/discovery.md`, `api-tests/CONVENTIONS.md`, `api-tests/src/clients/base.client.js`.
Status: **draft, awaiting approval**.

## 1. Goals
- Measure how much of `public/tools/schema/openapi_rest_demo.json` the Playwright suite exercises, from
  `api-tests/.coverage/requests.jsonl` only.
- Three dimensions (operations, status codes, parameters), each for **scope** and **global**.
- Report **drift**: traffic the spec does not describe.
- `diff` two reports to show per-PR deltas (Day 3).
- Same inputs → byte-identical outputs.

## 2. Non-goals
- Running tests or the server; any network access; any AI/LLM call.
- Validating response bodies against schemas; nested body properties (top level only).
- Header/cookie parameters (the recorder does not capture them).
- Fixing the spec or the server.
- HTML reports, badges, CI wiring (Day 3 consumes `diff`).

## 3. Requirements

| ID | Level | Requirement |
|----|-------|-------------|
| R1 | MUST | Standalone `coverage-tool/` package: own `package.json` + lockfile, CommonJS, Node ≥ 20. Only runtime dependency: `@apidevtools/swagger-parser` (exact version pinned). Tests use `node:test`. |
| R2 | MUST | No network. Spec is read from the repo file; swagger-parser runs with `resolve.external = false` (internal `$ref` only); `dereference.circular = "ignore"`. No `fetch`/`http` imports (checked by a test). |
| R3 | MUST | Inputs (defaults relative to repo root, each overridable by flag): spec `public/tools/schema/openapi_rest_demo.json` (`--spec`), requests `api-tests/.coverage/requests.jsonl` (`--requests`), config `coverage-tool/coverage.config.json` (`--config`). Output dir `coverage-tool/out/` (`--out-dir`). |
| R4 | MUST | Count **only** lines with `source === "test"`. Lines with other/missing `source`, invalid JSON, or `status === null` are skipped and counted in `inputs.requests.lines`. |
| R5 | MUST | The tool **derives** the path template itself (§5) and never trusts the recorder's `pathTemplate`. If the recorder's value is present and differs, emit warning `PATH_TEMPLATE_MISMATCH` (stderr + `report.json.warnings`). |
| R6 | MUST | Config `{ "scope": string[], "exclude": string[] }`; globs per §6. Defaults when file is absent: `scope = ["/articles*", "/comments*", "/users*", "/login"]`, `exclude = ["/restore*", "/debug/*"]`. |
| R7 | MUST | Dimensions (§7) computed for `scope` and `global`. |
| R8 | MUST | Drift (§8): unmatched requests, undocumented statuses, undocumented params. |
| R9 | MUST | `report` command writes `report.json` (§10) and `gaps.json` (§11) and prints a console table (§12). |
| R10 | MUST | `diff <base.json> <head.json>` prints per-dimension deltas and gap changes; `--out <file>` writes `diff.json` (§13). |
| R11 | MUST | Determinism (§9): byte-identical `report.json`, `gaps.json`, `diff.json` and stdout for identical inputs, on any OS/locale/TZ/cwd. |
| R12 | MUST | Exit codes: `0` success; `2` usage/input error (missing/unreadable spec or requests file, invalid config, unparsable spec, schemaVersion major mismatch in `diff`). Coverage level never changes the exit code of `report`. |
| R13 | SHOULD | `diff --fail-on-opened` exits `1` if any gap was opened (regression). |
| R14 | SHOULD | `coverage-tool/.gitignore`: `node_modules/`, `out/`. |
| R15 | SHOULD | README: commands, flags, config, output files, determinism guarantees. |

## 4. Inputs

### 4.1 Request line (produced by `api-tests`, not changed by this spec)
`{"source":"test","method":"GET","pathTemplate":"/articles/{id}","actualPath":"/articles/1","status":200,"queryParams":["_limit"],"bodyFields":["title"]}`
- `actualPath`: no `/api` prefix, no query string. Used as-is (no URL-decoding); a trailing `/` is removed unless the path is `/`.
- `method` is upper-cased by the tool before use.
- `queryParams`, `bodyFields`: names only; missing/non-array treated as `[]`.

### 4.2 Spec
- Dereferenced with swagger-parser (`dereference`, not `validate`).
- Operations = every `paths[p][m]` with `m ∈ {get,put,post,delete,options,head,patch,trace}`.
- Documented statuses = numeric (`^[1-5][0-9]{2}$`) keys of `responses`. Other keys (`default`, `2XX`) are ignored and produce warning `NON_NUMERIC_RESPONSE_KEY` (none exist today).
- Documented params per operation = union of:
  - path-level + operation-level `parameters` with `in ∈ {path, query}` (operation-level overrides on same `in`+`name`);
  - top-level `properties` keys of `requestBody.content[*].schema` (all content types), `in: "body"`. For `allOf`, properties of all members are merged; for `oneOf`/`anyOf`, unioned. `required` = name listed in the schema's `required` (any member); path params always `required: true`; query params use their `required` field (default `false`).
  - `in: header|cookie` params are ignored (non-goal).

## 5. Matching rule (actualPath → spec path)
1. Split `actualPath` and each spec path key on `/`. A spec segment `{name}` matches any non-empty segment (`[^/]+`); other segments match literally (case-sensitive). Segment counts must be equal.
2. If several spec paths match, choose the **most specific**: compare segment by segment from the left; at the first position where one is literal and the other is a parameter, the literal one wins. (So `/articles/search` beats `/articles/{id}`; `/surveys/statistics/{type}` beats `/surveys/{surveyType}/description`.) If still tied (two templates differing only in param names), choose the lowest key by code-unit order and emit warning `AMBIGUOUS_TEMPLATE`.
3. Method lookup happens **after** path selection (OpenAPI precedence). If the chosen path has no operation for the method → drift `unmatchedRequests` with `reason: "no-method"` and `matchedPath`. No path matched → `reason: "no-path"`.
4. The recorder's `pathTemplate` is compared to the derived path only for the R5 warning.

## 6. Scope and exclude globs
- Glob syntax: `*` matches any sequence of characters **including `/`**; every other character is literal (`{`, `}` included). Whole-string match. No other wildcards.
- Matched against the derived spec path for operations and matched requests; against `actualPath` for unmatched requests.
- `exclude` wins over `scope` and applies **globally**: excluded operations are absent from every total, list and gap; excluded requests are dropped (counted in `lines.excluded`).
- `global` = all non-excluded operations. `scope` = global ∩ (matches any `scope` glob).
- Note: `/users*` also matches `/users/search` and would match a hypothetical `/users-x`. Intended.

## 7. Dimensions
Counted requests only (R4, non-excluded, matched to a documented operation).

| Dimension | Item | Covered when |
|---|---|---|
| operations | each documented operation (`METHOD path`) | ≥ 1 counted request |
| statuses | each (operation, documented numeric status) | ≥ 1 counted request with that status |
| parameters | each (operation, `in`, documented name), `in ∈ {path, query, body}` | `path`: operation covered. `query`: name in `queryParams` of ≥ 1 request. `body`: name in `bodyFields` of ≥ 1 request. |

Metric = `{ covered, total, percent }`, `percent = Math.round(covered * 10000 / total) / 100`, `null` when `total = 0`.

## 8. Drift
- `unmatchedRequests`: counted requests with `reason` `no-path` or `no-method`, grouped by (`method`, `actualPath`).
- `undocumentedStatuses`: (operation, status) observed but not in `responses`. Example: `DELETE /articles/{id}#404`.
- `undocumentedParams`: query names / body fields sent that are not documented for the operation. Example: `GET /articles?query._limit`.

Drift never affects coverage totals.

## 9. Determinism rules
- No timestamps, durations, hostnames, absolute paths, random values or env-dependent data in any output.
- Paths in outputs are repo-relative with `/` separators (as passed, normalised).
- All strings compared by code-unit order (`a < b`), never `localeCompare`.
- Canonical sort (operations, gaps, drift): `path` → method rank (`GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, TRACE`) → type rank (`operation, status, param`) → `status` ascending → `in` rank (`path, query, body`) → `param` → `actualPath`.
- Object keys emitted in the order defined by the schemas below (objects built explicitly, never by spreading input).
- `JSON.stringify(value, null, 2) + "\n"`, UTF-8, `\n` line endings. Console uses `\n`, no colours, no TTY detection.
- Input hashes: `sha256` (hex) of the raw file bytes.

## 10. `report.json` (schemaVersion 1.0.0)

Item/gap ids:
- operation `GET /articles/{id}` · status `PUT /comments/{id}#404` · param `POST /articles?body.title`, `GET /articles/search?query._limit`, `GET /articles/{id}?path.id`.

JSON Schema (draft 2020-12):

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "coverage-tool/report.schema.json",
  "title": "GAD API coverage report",
  "type": "object",
  "additionalProperties": false,
  "required": ["schemaVersion", "tool", "inputs", "summary", "operations", "drift", "warnings"],
  "properties": {
    "schemaVersion": { "const": "1.0.0" },
    "tool": {
      "type": "object", "additionalProperties": false, "required": ["name", "version"],
      "properties": { "name": { "const": "gad-coverage-tool" }, "version": { "type": "string" } }
    },
    "inputs": {
      "type": "object", "additionalProperties": false, "required": ["spec", "requests", "config"],
      "properties": {
        "spec": {
          "type": "object", "additionalProperties": false,
          "required": ["path", "sha256", "openapi", "infoVersion", "operationsTotal", "operationsExcluded"],
          "properties": {
            "path": { "type": "string" }, "sha256": { "$ref": "#/$defs/sha256" },
            "openapi": { "type": "string" }, "infoVersion": { "type": "string" },
            "operationsTotal": { "$ref": "#/$defs/count" }, "operationsExcluded": { "$ref": "#/$defs/count" }
          }
        },
        "requests": {
          "type": "object", "additionalProperties": false, "required": ["path", "sha256", "lines"],
          "properties": {
            "path": { "type": "string" }, "sha256": { "$ref": "#/$defs/sha256" },
            "lines": {
              "type": "object", "additionalProperties": false,
              "required": ["total", "invalid", "nonTest", "nullStatus", "excluded", "counted", "unmatched"],
              "properties": {
                "total": { "$ref": "#/$defs/count" }, "invalid": { "$ref": "#/$defs/count" },
                "nonTest": { "$ref": "#/$defs/count" }, "nullStatus": { "$ref": "#/$defs/count" },
                "excluded": { "$ref": "#/$defs/count" }, "counted": { "$ref": "#/$defs/count" },
                "unmatched": { "$ref": "#/$defs/count" }
              }
            }
          }
        },
        "config": {
          "type": "object", "additionalProperties": false, "required": ["path", "sha256", "scope", "exclude"],
          "properties": {
            "path": { "type": ["string", "null"] }, "sha256": { "oneOf": [{ "$ref": "#/$defs/sha256" }, { "type": "null" }] },
            "scope": { "$ref": "#/$defs/globs" }, "exclude": { "$ref": "#/$defs/globs" }
          }
        }
      }
    },
    "summary": {
      "type": "object", "additionalProperties": false, "required": ["scope", "global"],
      "properties": { "scope": { "$ref": "#/$defs/dimensions" }, "global": { "$ref": "#/$defs/dimensions" } }
    },
    "operations": { "type": "array", "items": { "$ref": "#/$defs/operation" } },
    "drift": {
      "type": "object", "additionalProperties": false,
      "required": ["unmatchedRequests", "undocumentedStatuses", "undocumentedParams"],
      "properties": {
        "unmatchedRequests": { "type": "array", "items": { "$ref": "#/$defs/unmatched" } },
        "undocumentedStatuses": { "type": "array", "items": { "$ref": "#/$defs/driftStatus" } },
        "undocumentedParams": { "type": "array", "items": { "$ref": "#/$defs/driftParam" } }
      }
    },
    "warnings": { "type": "array", "items": { "$ref": "#/$defs/warning" } }
  },
  "$defs": {
    "count": { "type": "integer", "minimum": 0 },
    "sha256": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
    "globs": { "type": "array", "items": { "type": "string" } },
    "method": { "enum": ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "TRACE"] },
    "status": { "type": "integer", "minimum": 100, "maximum": 599 },
    "paramIn": { "enum": ["path", "query", "body"] },
    "metric": {
      "type": "object", "additionalProperties": false, "required": ["covered", "total", "percent"],
      "properties": {
        "covered": { "$ref": "#/$defs/count" }, "total": { "$ref": "#/$defs/count" },
        "percent": { "type": ["number", "null"], "minimum": 0, "maximum": 100 }
      }
    },
    "dimensions": {
      "type": "object", "additionalProperties": false, "required": ["operations", "statuses", "parameters"],
      "properties": {
        "operations": { "$ref": "#/$defs/metric" }, "statuses": { "$ref": "#/$defs/metric" },
        "parameters": { "$ref": "#/$defs/metric" }
      }
    },
    "operation": {
      "type": "object", "additionalProperties": false,
      "required": ["id", "method", "path", "inScope", "covered", "requests", "statuses", "parameters"],
      "properties": {
        "id": { "type": "string" }, "method": { "$ref": "#/$defs/method" }, "path": { "type": "string" },
        "inScope": { "type": "boolean" }, "covered": { "type": "boolean" }, "requests": { "$ref": "#/$defs/count" },
        "statuses": {
          "type": "array",
          "items": {
            "type": "object", "additionalProperties": false, "required": ["status", "documented", "requests"],
            "properties": {
              "status": { "$ref": "#/$defs/status" }, "documented": { "type": "boolean" },
              "requests": { "$ref": "#/$defs/count" }
            }
          }
        },
        "parameters": {
          "type": "array",
          "items": {
            "type": "object", "additionalProperties": false,
            "required": ["in", "name", "documented", "required", "requests"],
            "properties": {
              "in": { "$ref": "#/$defs/paramIn" }, "name": { "type": "string" },
              "documented": { "type": "boolean" }, "required": { "type": "boolean" },
              "requests": { "$ref": "#/$defs/count" }
            }
          }
        }
      }
    },
    "unmatched": {
      "type": "object", "additionalProperties": false,
      "required": ["method", "actualPath", "reason", "matchedPath", "inScope", "requests", "statuses"],
      "properties": {
        "method": { "type": "string" }, "actualPath": { "type": "string" },
        "reason": { "enum": ["no-path", "no-method"] }, "matchedPath": { "type": ["string", "null"] },
        "inScope": { "type": "boolean" }, "requests": { "$ref": "#/$defs/count" },
        "statuses": { "type": "array", "items": { "$ref": "#/$defs/status" } }
      }
    },
    "driftStatus": {
      "type": "object", "additionalProperties": false,
      "required": ["id", "method", "path", "status", "inScope", "requests"],
      "properties": {
        "id": { "type": "string" }, "method": { "$ref": "#/$defs/method" }, "path": { "type": "string" },
        "status": { "$ref": "#/$defs/status" }, "inScope": { "type": "boolean" }, "requests": { "$ref": "#/$defs/count" }
      }
    },
    "driftParam": {
      "type": "object", "additionalProperties": false,
      "required": ["id", "method", "path", "in", "param", "inScope", "requests"],
      "properties": {
        "id": { "type": "string" }, "method": { "$ref": "#/$defs/method" }, "path": { "type": "string" },
        "in": { "enum": ["query", "body"] }, "param": { "type": "string" },
        "inScope": { "type": "boolean" }, "requests": { "$ref": "#/$defs/count" }
      }
    },
    "warning": {
      "type": "object", "additionalProperties": false, "required": ["code", "message", "count"],
      "properties": {
        "code": { "enum": ["PATH_TEMPLATE_MISMATCH", "AMBIGUOUS_TEMPLATE", "NON_NUMERIC_RESPONSE_KEY", "INVALID_LINE"] },
        "message": { "type": "string" }, "count": { "type": "integer", "minimum": 1 }
      }
    }
  }
}
```

Field notes:
- `operations[]`: every non-excluded documented operation, canonical order. `statuses[]` = documented ∪ observed (undocumented have `documented:false`), ascending. `parameters[]` = documented ∪ observed query/body, order `in` rank then name; undocumented have `documented:false, required:false`. `requests` = counted requests for that item. `covered` = `requests > 0`.
- `inputs.requests.lines`: `total` = non-empty lines; buckets are exclusive and applied in order invalid → nonTest → nullStatus → excluded → counted; `unmatched` ⊆ `counted`.
- `warnings[]`: deduplicated by `(code, message)`, `count` = occurrences, sorted by code then message. Message is deterministic, e.g. `GET /articles/1: recorder "/articles/{x}" != derived "/articles/{id}"` (for INVALID_LINE: `line 12: Unexpected token`).

## 11. `gaps.json`
Array of uncovered items (documented, non-excluded, `requests = 0`) for all three types, in canonical order.
An uncovered operation also yields gaps for each of its statuses and path/query/body params.

```json
[
  { "id": "PUT /comments/{id}", "type": "operation", "inScope": true, "method": "PUT", "path": "/comments/{id}" },
  { "id": "PUT /comments/{id}#404", "type": "status", "inScope": true, "method": "PUT", "path": "/comments/{id}", "status": 404 },
  { "id": "POST /articles?body.image", "type": "param", "inScope": true, "method": "POST", "path": "/articles", "in": "body", "param": "image" }
]
```

Key order: `id, type, inScope, method, path`, then `status` (status) or `in, param` (param). Absent keys are omitted, never `null`. `id` is unique.

## 12. Console output (`report`)
1. Summary table: rows `operations | statuses | parameters`, columns `scope covered/total %` and `global covered/total %`.
2. In-scope operations table: `METHOD  PATH  requests  statuses x/y  params x/y`, canonical order.
3. Drift counts and warning counts; the paths of written files (repo-relative).

Warnings also go to stderr, one line each, same order as `report.json`.

## 13. `diff`
Input: two `report.json` files (gaps are re-derived from them, so `gaps.json` is not needed). Fails with exit 2 if either `schemaVersion` major ≠ 1.

`diff.json`:
```json
{
  "schemaVersion": "1.0.0",
  "base": { "path": "base.json", "sha256": "…" },
  "head": { "path": "head.json", "sha256": "…" },
  "summary": {
    "scope":  { "operations": { "base": {"covered":0,"total":0,"percent":null}, "head": {"covered":0,"total":0,"percent":null}, "deltaCovered": 0, "deltaTotal": 0, "deltaPercent": null }, "statuses": {}, "parameters": {} },
    "global": {}
  },
  "gaps": { "closed": [], "opened": [], "added": [], "removed": [] },
  "drift": { "added": [], "removed": [] }
}
```
(`statuses`/`parameters` have the same shape as `operations`; `global` has the same shape as `scope`; gap arrays hold §11 gap objects; drift arrays hold id strings.)

- `closed`: gap in base, item exists and is covered in head. `opened`: item covered in base, gap in head (regression). `added`: gap in head whose item does not exist in base (new spec item). `removed`: gap in base whose item no longer exists in head.
- `deltaPercent` = `round2(head.percent − base.percent)`, `null` if either is `null`.
- `drift.added/removed`: drift ids (unmatched: `METHOD actualPath`) present only in head / only in base.
- Gap objects use the §11 shape; all arrays in canonical order.
- Console: per-dimension delta table (scope and global), then the four gap lists (ids only).

## 14. Acceptance criteria
1. `cd coverage-tool && npm ci && npm test` passes.
2. `node coverage-tool/bin/coverage.js report` on the current repo writes `out/report.json` and `out/gaps.json`; `report.json` validates against §10.
3. Running `report` twice (also from a different cwd, with `TZ`/`LANG` changed) gives identical bytes for both files and stdout.
4. A fixture with `DELETE /articles/1 → 404` reports `DELETE /articles/{id}#404` in `drift.undocumentedStatuses`.
5. A fixture with `GET /articles/search` maps to `/articles/search`, not `/articles/{id}`; a wrong recorder `pathTemplate` yields `PATH_TEMPLATE_MISMATCH`.
6. `diff` of a report with itself → all deltas 0, all gap lists empty; with a fixture pair → expected closed/opened.
7. No network modules required in `coverage-tool/src/`.

## 15. Open items
- `requestBody.required`/schema `required` only populate the informational `required` flag; they don't weight coverage.
- Multipart body fields can't be recorded today (BaseClient records plain-object `data` only); such params stay gaps.
