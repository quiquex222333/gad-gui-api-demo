# CLAUDE.md

- Never commit `db/db.json` (git-tracked, but the server rewrites it on every API test run).
- After a test run, check `git status`; if `db/db.json` changed, tell the user.
- If a permission rule blocks a required edit, STOP and report which rule and which file. Never skip a task silently.
