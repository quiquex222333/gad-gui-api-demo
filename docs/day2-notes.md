# Day 2 notes — baseline vs AI estimate

**Baseline (tool, `docs/day2-baseline/`)**: 18 request lines (2 non-test, 16 counted, 0 invalid/unmatched).

| Dimension (scope) | Tool | AI run 1 | AI run 2 |
|---|---|---|---|
| Operations | 8/26 (30.77%) | 8/26 | 8/26 |
| Statuses | 12/81 (14.81%) | 12/81 | 12/81 |
| Parameters | 11/91 (12.09%) | 11/91 | 11/91 |

- Global denominators (164 ops / 381 statuses / 244 params) were only produced by the tool; the AI estimates left `global` null.
- **Estimate vs tool**: all three scope percentages match exactly, both runs. Only per-operation request counts differ in run 1 (`GET /articles` 1 vs 2, `GET /articles/{id}` 2 vs 3); run 2 matches the tool.
- **Run 1 vs run 2**: same summary numbers, same gaps and drift; they differ only in those 2 request counts (diff-est1-vs-est2.json).
- The AI reported only in-scope ops; the tool also lists out-of-scope observed ops (e.g. `GET /about`, `PATCH /api/books/{id}`) as "added" gaps.
- **Drift found by the tool: none.** 0 unmatched requests, 0 undocumented statuses, 0 undocumented params (the AI runs also reported 0).
- Caveat: matching summaries came from the same small suite; the AI had no way to know exact request counts or global totals without the tool.
- CI: `.github/workflows/api-coverage.yml` (single job; Day 3 adds the base-vs-PR delta).
