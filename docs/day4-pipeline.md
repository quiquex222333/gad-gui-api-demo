# Day 4 – Multi-agent pipeline

Two agents, one workflow. The **feature-developer** agent (local, `.claude/agents/feature-developer.md`) ships an endpoint with its spec and OpenAPI, but no tests. The **test-generator** agent runs headless in CI (`test-agent` job in `.github/workflows/api-coverage.yml`) and closes the in-scope gaps the PR opened.

Deterministic code makes every decision. The agents only produce diffs: CI measures them, gates them and enforces the rules on them.

## Flow

```mermaid
flowchart TD
    REQ([Feature request]) --> FD

    subgraph LOCAL["Local: feature-developer (sonnet)"]
        FD[Write specs/NNN-feature/spec.md] --> IMPL[Implement routes/ + endpoints/<br/>seed db/db-base-test.json if needed]
        IMPL --> OAS[Update openapi_rest_demo.json<br/>every op / status / param]
        OAS --> CURL{{"curl each status on :3005"}}
        CURL --> FDG{{"check:guard origin/main..HEAD"}}
        FDG --> PR[Commit 'Agent: feature-developer'<br/>push + gh pr create]
    end

    PR --> CI1

    subgraph COV["CI: api-coverage-pr"]
        CI1{{"check:guard base..head<br/>(Agent trailer rules, db/db.json forbidden)"}} --> TESTS{{"Playwright suite base + head"}}
        TESTS --> DIFF{{"coverage report ×2 → diff.json<br/>(deterministic, byte-identical)"}}
        DIFF --> ART[(artifact coverage-report)]
        DIFF --> STICKY[Sticky coverage comment]
    end

    ART --> G0

    subgraph TA["CI: test-agent"]
        G0{{"same-repo PR? head == head.sha?"}} -->|no| SKIP([skip, reason in job summary])
        G0 -->|yes| G1{{"head commit has<br/>'Agent: test-generator'?"}}
        G1 -->|yes| SKIP
        G1 -->|no| G2{{"LOOP GUARD<br/>agent commits in base..head < 2?"}}
        G2 -->|no| SKIP
        G2 -->|yes| G3{{"diff.json: in-scope<br/>gaps.opened > 0?"}}
        G3 -->|no| SKIP
        G3 -->|yes| AG["claude -p --agent test-generator<br/>model claude-sonnet-5-5, --max-turns 60, --max-budget-usd 5<br/>dontAsk + allowedTools / disallowedTools"]
        AG --> M{{"Re-measure: full suite +<br/>coverage report; closed = batch − gaps.json"}}
        M --> P{{"Changed tracked paths ⊆<br/>api-tests/, docs/agent-runs/"}}
        P --> D{{"subtype == success AND closed > 0<br/>AND suite pass AND paths ok?"}}
        D -->|no: closed 0, error_max_turns,<br/>suite fail, scope breach| CMT[PR comment: measured result +<br/>agent run summary, no push]
        D -->|yes| COMMIT[Commit 'Agent: test-generator'<br/>incl. docs/agent-runs/branch.json]
        COMMIT --> GUARD{{"check:guard base..HEAD"}}
        GUARD -->|fail| STOP([job fails, nothing pushed])
        GUARD -->|ok| PUSH[push with AGENT_PUSH_TOKEN]
    end

    PUSH -. "PAT push re-triggers workflow:<br/>CI re-measures, agent report not trusted" .-> CI1
    G1 -. "next run after agent push<br/>stops here (loop guard)" .-> SKIP

    classDef det fill:#e8f1ff,stroke:#2b6cb0,color:#1a365d;
    classDef guard fill:#fff4e5,stroke:#c05621,color:#7b341e,stroke-width:2px;
    classDef agent fill:#f3e8ff,stroke:#6b46c1,color:#44337a;
    class CURL,FDG,CI1,TESTS,DIFF,G0,G3,M,P,D,GUARD det;
    class G1,G2 guard;
    class FD,IMPL,OAS,AG agent;
```

Legend: blue hexagons = deterministic checks; orange = loop guard; purple = LLM steps.

## Deterministic checks

| # | Where | Check | On failure |
|---|---|---|---|
| 1 | feature-developer | curl each documented status on :3005 | agent reports mismatch, doesn't drop the status |
| 2 | feature-developer, api-coverage-pr, test-agent | `check:guard` over the commit range: `Agent: test-generator` may only touch `api-tests/`, `docs/agent-runs/`; `Agent: feature-developer` never touches `api-tests/`, `coverage-tool/`, `.github/`; nobody commits `db/db.json` | job fails |
| 3 | api-coverage-pr | Playwright suite (head), coverage report base + head, `diff` | job fails / diff published |
| 4 | test-agent gate | same-repo PR (secrets), head not moved past `head.sha` | skip |
| 5 | test-agent gate | **loop guard**: head commit carries `Agent: test-generator` → skip; ≥ 2 such commits in `base..head` → skip | skip |
| 6 | test-agent gate | batch = `diff.json` `gaps.opened` with `inScope: true`; empty → skip | skip |
| 7 | test-agent | agent result `subtype` from `--output-format json` (`success` / `error_max_turns` / `error_max_budget_usd` / …) | comment, no push |
| 8 | test-agent | CI re-runs the full suite and `coverage:report`; `closed` = batch ids missing from the new `gaps.json` | `closed == 0` or suite fail → comment, no push |
| 9 | test-agent | tracked changes only in `api-tests/`, `docs/agent-runs/` (`db/db.json` restored first) | job fails, comment |
| 10 | test-agent | `check:guard base..HEAD` after commit, before push | job fails, nothing pushed |
| 11 | next workflow run | push via PAT re-triggers `api-coverage-pr`: CI re-measures from scratch | normal coverage result |

### Why the loop terminates
Run N+1 is triggered by the agent's push, so its head commit carries `Agent: test-generator` and the gate skips (check 5). A human push after that can re-arm the agent once more. The `< 2` agent-commits rule caps it at two agent commits per PR, whatever happens.

## Headless agent: permission layers
1. `--permission-mode dontAsk` + `--permission-prompts none`: anything not explicitly allowed is denied, and nobody is asked.
2. `--allowedTools`: `Read Glob Grep`, `Edit(/api-tests/**)`, `Edit(/docs/agent-runs/**)` (Edit rules also cover Write), plus a fixed list of exact Bash commands (`npm --prefix api-tests test …`, `npm run coverage:report`, `git status --porcelain`, …). There's no `node -e`: the agent reads `gaps.json` with Read/Grep.
3. `--disallowedTools`: `Agent WebFetch WebSearch mcp__*`, `Edit()` on every protected tree (`endpoints/ routes/ server.js public/ coverage-tool/ .github/ db/ .claude/ scripts/ specs/ CLAUDE.md package*.json`), and `git add/commit/push/reset/checkout/config`, `gh`, `curl`, `wget`, `node`, `npx`, `npm start`, `rm`, `env`, `printenv`. Deny is evaluated before allow, so the project `.claude/settings.json` allow rules (`git push *`, `gh pr create *`) can't reopen them.
4. `persist-credentials: false` keeps no token in `.git/config`. `AGENT_PUSH_TOKEN` exists only in the push step's env, and `ANTHROPIC_API_KEY` only in the agent step's env.
5. Steps 9 and 10 (path check, `check:guard`) are the final enforcement. A Bash command that writes files can sidestep Edit rules, and these steps catch that.

Design choice: the agent writes the tests and `docs/agent-runs/<branch>.json`, and the **workflow** makes the commit (trailer `Agent: test-generator`), runs `check:guard` and pushes. This keeps the push token out of the agent's environment and matches `test-generator.md` ("the caller owns git").

## Verified CLI flags (Claude Code 2.1.319)
Checked against `claude --help` and https://code.claude.com/docs/en/cli-reference:
`-p`, `--agent`, `--model`, `--max-budget-usd`, `--permission-mode dontAsk`, `--permission-prompts none`, `--no-session-persistence`, `--output-format json`, `--allowedTools`, `--disallowedTools` (variadic, so the prompt is passed first). `--max-turns` is in the docs ("Limit the number of agentic turns (print mode only)") but is **not listed by `--help`**. On the limit, the result has `subtype: "error_max_turns"` and the process exits non-zero (docs: agent-sdk/agent-loop). Path rules: `/path` in CLI rules anchors at the working directory (repo root in CI). The CLI version is pinned in `CLAUDE_CODE_VERSION`.

## Known limitation: `opened` vs `added`
The batch uses `gaps.opened` as specified. In `coverage-tool/src/diff.js`, *opened* means "covered in base, gap in head" (a regression). A brand-new operation from feature-developer appears in `gaps.added` instead. As written, the job won't fire on a pure new-endpoint PR. To cover those, change the gate filter to `[...d.gaps.opened, ...d.gaps.added]`.

## Secrets
| Secret | Used in | Minimal permissions |
|---|---|---|
| `ANTHROPIC_API_KEY` | `Run test-generator headless` step only | Claude Console API key in a dedicated workspace with a monthly spend limit |
| `AGENT_PUSH_TOKEN` | `Commit, check:guard, push` step only | Fine-grained PAT, **this repository only**: `Contents: Read and write` (push), `Metadata: Read` (mandatory). Nothing else: no Workflows permission, so it can't push `.github/workflows` changes. Short expiry. |

`GITHUB_TOKEN` (automatic) posts the PR comment (`pull-requests: write` on the job).
