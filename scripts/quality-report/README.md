# Quality report (GitHub Pages)

One static page that joins the API test results, the OpenAPI coverage and their history
over the **last 5 CI runs**. The newest run is shown by default; any older run can be selected
from the run chips, the trend charts or the history table.

## How it is produced

| Step | Where | Output |
|---|---|---|
| Playwright JSON reporter | `api-tests/playwright.config.js` | `api-tests/reports/results.json` |
| Coverage tool | `npm run coverage:report` | `coverage-tool/out/report.json`, `gaps.json` |
| Snapshot of one run | `snapshot.js` (CI job `api-coverage`) | artifact `quality-snapshot` |
| Report from 5 snapshots | `build.js` (CI job `quality-report`) | artifact `quality-report-site` |
| Publish | CI job `deploy-pages` (only `main`) | GitHub Pages |

`quality-report` downloads the `quality-snapshot` artifact of the previous 4 completed push /
manual runs on the same branch. Runs from before this feature only have `coverage-report`; they are
turned into coverage-only snapshots, so history is available from the first deploy.

## Contents

- Status banner, KPI tiles with delta vs the previous run and 5-run sparklines
  (pass rate, tests, duration, operation / status / parameter coverage).
- Trends: coverage % per run and tests by outcome per run (each with a table view).
- Coverage per resource, per operation, scope vs effective vs global, waivers and contract drift.
- Tests: failures with error message, slowest tests, per-file results, known failures (`test.fail`).
- Coverage gaps grouped by endpoint, filterable and searchable.
- History table of the 5 runs.

The page is a single self-contained `index.html` (no external requests), light/dark aware and
responsive. `history.json` next to it holds the same data.

## Local preview

```bash
cd api-tests && npx playwright test && cd ..
npm run coverage:report
npm run quality:snapshot
npm run quality:build      # -> quality-site/index.html
```

## One-time repository setup

Settings → Pages → Build and deployment → Source: **GitHub Actions**.
