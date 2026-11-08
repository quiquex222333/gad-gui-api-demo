---

Closed ids: 33 of 36. These are POST /comments#400 and #422, GET /comments/{id}#404, and every PUT, PATCH, DELETE and HEAD id in the batch except the three below. After npm run coverage:report, they are all absent from gaps.json.

Still-open ids:
- GET /comments/{id}#400: spec documents 400 for an invalid id, app returns 404. A test.fail() test exists, but the observed status is 404, so the gap stays open.
- HEAD /comments/{id}#400: same cause as the GET case. A test.fail() test exists and the gap stays open.
- PUT /comments/{id}#404: no code path produces it. An unknown id is an upsert and returns 201. See the waiver below.

Bugs found (test.fail):
- GET /comments/{id}#400: spec says 400 for an invalid id, app returns 404 {} for abc. The app has no id validation in endpoints/comments-endpoint.helpers.js, so json-server's resource lookup answers.
- HEAD /comments/{id}#400: same, 404 for abc.
- Both tests are in api-tests/tests/comments.spec.js. Each carries a BUG? spec: 400 ..., app: 404 ... comment. I did not cite a precise file:line for the lookup, because it happens inside json-server and not in the endpoint file.

Proposed waivers:
- PUT /comments/{id}#404: the PUT branch (endpoints/comments-endpoint.helpers.js:~190-260) turns a missing comment into a POST (req.method = "POST", around line 253). It returns 201, never 404. I did not write a fake test for it.

Files changed:
- /home/enriquerivera/ses/gad-gui-api-demo/api-tests/src/clients/comments.client.js: create, put and patch now take an optional headers argument. It is needed to send malformed JSON with a JSON content-type and get the 400s.
- /home/enriquerivera/ses/gad-gui-api-demo/api-tests/tests/comments.spec.js: 20 new tests plus local helpers.

I added no new PATHS, so path-templates.spec.js needed no change.

Test results: the full suite passes (44 tests, 2 of them expected-fail via test.fail), and check:guard passes.

Server note: npm start failed because a server was already running on :3000 and :3010 (pid 178675, not started by me). I ran everything with GAD_URL=http://localhost:3000 instead of :3005. I did not start or stop any server. The failed npm start attempt left no process.

db/db.json: it shows as modified in git status (it was already modified before I started, and the test runs rewrite it). I did not stage it. .claude/ is untracked.

Checklist:
- [x] Gaps read from the tool, not estimated
- [x] Every status cites file:line, except the json-server 404 noted above
- [x] Client / builder / fixtures follow CONVENTIONS.md
- [x] New PATHS registered in path-templates.spec.js (none added)
- [x] No weakened assertions
- [x] Every test.fail has a BUG? spec: X, app: Y comment
- [x] Waivers proposed with evidence, no fake tests
- [x] New specs green (or test.fail with reason)
- [x] Full suite + check:guard pass
- [ ] Assigned ids absent from gaps.json: 3 remain (see Still-open ids)
- [x] db/db.json not staged, and reported as modified