---
name: add-api-test
description: Cover API gaps / add API tests for GAD endpoints, using the coverage tool's gaps.json as the only source of truth. Use when asked to "cover API gaps", "add API tests", close coverage gap ids, or raise API coverage.
---

# add-api-test

Close assigned coverage gaps by writing Playwright API tests in `api-tests/`. Paths are relative to the repo root unless noted.

## 0. Preconditions
- Read `api-tests/CONVENTIONS.md` first. If code and doc disagree, the code wins.
- The server must be running on `:3005` (`npm start` at the repo root, in the background). `api-tests/playwright.config.js` has no `webServer`.
- You may only write inside `api-tests/`. Never edit `endpoints/`, `routes/`, `server.js`, the OpenAPI spec, `coverage-tool/` (including `coverage.config.json`), `.github/` or `db/`.

## 1. Gaps come ONLY from the tool
1. Run `npm run coverage:report` from the repo root.
2. Read `coverage-tool/out/gaps.json`, filtered to `inScope === true` and the assigned gap ids, e.g.
   `node -e "const g=require('./coverage-tool/out/gaps.json');const ids=new Set(process.argv.slice(1));console.log(JSON.stringify(g.filter(x=>x.inScope&&ids.has(x.id)),null,2))" "GET /articles/{id}#404"`
3. Never estimate coverage by reading code. An assigned id that is not in `gaps.json` is "already closed / unknown": report it and skip it.

## 2. Research each operation
- Read its entry in `public/tools/schema/openapi_rest_demo.json`: documented statuses, path/query params, requestBody schema, `required`.
- Read its handler in `endpoints/` (and `routes/`, `routes/controllers/`) to learn what input produces each status.
- Cite `file:line` in your reasoning for every status you plan to trigger.

## 3. Write tests per CONVENTIONS.md
- Go through a client method that only calls `this.send(METHOD, PATHS.x, { pathParams, params, data })`. Add a method only if it is missing. For a new path, add it to `PATHS`, to the `clients` map in `tests/framework/path-templates.spec.js`, and (new client) to `createClients` in `src/clients/index.js`.
- Payloads come from builders in `src/builders/` (`uniqueId()`, accept `overrides`).
- Import `{ test, expect }` from `../src/fixtures`; use `api` (no auth, 401 cases) or `authApi` (writes).
- Title: `<METHOD> /<path> <expected behaviour>`. One `test.describe('<Resource>')` per spec file.
- No raw `request.*`, no hardcoded ids (create the resource, use `body.id`), no shared mutable data, no snapshots.
- Param gaps: send the documented query names / body fields so the recorder sees them.

## 4. One test per documented status
- Assert the exact status: `expect(res.status()).toBe(<status>)`, then body fields, then a read-back GET where it makes sense.
- If the app returns something else: KEEP the assertion, add `test.fail()` and a comment `// BUG? spec: X, app: Y (file:line)`. Never change an assertion to match observed behaviour, never loosen a status.

## 5. Unreachable by design
Do not write a fake test. Record a **proposed waiver**: gap id, why it cannot be triggered, `file:line` evidence. Only propose it in the report; never edit `coverage.config.json`.

## 6. Bounded loop
- Run only the new or changed specs: `cd api-tests && npx playwright test tests/<file>.spec.js`.
- At most 3 fix attempts per failing test (fix test code, never the expected status). Then stop and report it as still-open with the last error.

## 7. Verify
1. `cd api-tests && npm test && npm run check:guard`.
2. From the repo root: `npm run coverage:report`; re-filter `gaps.json` and confirm each assigned id is gone.
3. `git status`. If `db/db.json` changed, tell the user and never stage it. Stage only explicit `api-tests/` paths.

## 8. Write the run summary file
Before returning, write `docs/agent-runs/<branch-name>.json` (branch name with `/` replaced by `-`) with all of these fields, empty arrays/objects when none:
`{ batch, gapIdsAssigned, closed, stillOpen: [{id, reason, evidence}], bugs: [{test, expected, actual, evidence}], proposedWaivers, filesChanged, fixAttempts }`.
This is the only file you may write outside `api-tests/`. Values come from `gaps.json`, test output and `api-tests/.coverage/requests.jsonl`. `fixAttempts` records attempts used per test (max 3, see step 6). Do not stage or commit it: the caller includes it in the commit and pastes its content in the PR body.

## Output format
- **Closed ids**
- **Still-open ids** (with reason)
- **Bugs found** (`test.fail`: id, spec vs app, `file:line`)
- **Proposed waivers** (id, reason, `file:line`)
- **Files changed**

End with this checklist, ticked or explained:
- [ ] Gaps read from the tool, not estimated
- [ ] Every status cites `file:line`
- [ ] Client / builder / fixtures follow CONVENTIONS.md
- [ ] New `PATHS` registered in `path-templates.spec.js`
- [ ] No weakened assertions
- [ ] Every `test.fail` has a `BUG? spec: X, app: Y (file:line)` comment
- [ ] Waivers proposed with evidence, no fake tests
- [ ] New specs green (or `test.fail` with reason)
- [ ] Full suite + `check:guard` pass
- [ ] Assigned ids absent from `gaps.json`
- [ ] `db/db.json` not staged (and reported if modified)
- [ ] `docs/agent-runs/<branch-name>.json` written with all fields (batch, gapIdsAssigned, closed, stillOpen, bugs, proposedWaivers, filesChanged, fixAttempts) and consistent with the final message
- [ ] Caller reminded: commit that JSON file and paste its content in the PR body
