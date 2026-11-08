#!/usr/bin/env node
"use strict";
/**
 * Builds a compact, self-describing metrics snapshot for ONE CI run.
 *
 *   node scripts/quality-report/snapshot.js \
 *     --report coverage-tool/out/report.json \
 *     --gaps coverage-tool/out/gaps.json \
 *     [--results api-tests/reports/results.json] \
 *     --out quality-snapshot/snapshot.json
 *
 * Run metadata comes from the GitHub Actions env (GITHUB_RUN_ID, GITHUB_SHA, ...) and can be
 * overridden with --run-id, --run-number, --sha, --branch, --event, --actor, --created-at, --run-url.
 * --results is optional: older runs only kept the coverage artifact, so their snapshot has tests: null.
 */
const fs = require("fs");
const path = require("path");

const SCHEMA_VERSION = 1;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) throw new Error(`Unexpected argument: ${a}`);
    const key = a.slice(2);
    const val = argv[i + 1];
    if (val === undefined || val.startsWith("--")) throw new Error(`Missing value for --${key}`);
    args[key] = val;
    i++;
  }
  return args;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function round(n, digits = 2) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function pct(covered, total) {
  return total ? round((covered / total) * 100) : 0;
}

/* ---------------------------------------------------------------- tests */

function firstError(result) {
  const err = (result && (result.errors?.[0] || result.error)) || null;
  if (!err) return null;
  // Strip ANSI colours and keep the message short enough for a table cell.
  // eslint-disable-next-line no-control-regex
  const msg = String(err.message || err.value || "").replace(/\u001b\[[0-9;]*m/g, "");
  return msg.split("\n").slice(0, 6).join("\n").slice(0, 600);
}

function summarizeTests(results) {
  const tests = [];
  const walk = (suite, file, titles) => {
    const f = suite.file || file;
    const t = suite.title && suite.title !== f ? [...titles, suite.title] : titles;
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        const runs = test.results || [];
        const last = runs[runs.length - 1];
        const duration = runs.reduce((s, r) => s + (r.duration || 0), 0);
        // Playwright status: expected | unexpected | flaky | skipped.
        let outcome = test.status;
        if (outcome === "expected" && test.expectedStatus === "failed") outcome = "knownFailure";
        tests.push({
          file: spec.file || f,
          title: [...t, spec.title].join(" › "),
          outcome,
          duration,
          retries: Math.max(0, runs.length - 1),
          error: outcome === "unexpected" || outcome === "flaky" ? firstError(last) : null,
        });
      }
    }
    for (const child of suite.suites || []) walk(child, f, t);
  };
  for (const s of results.suites || []) walk(s, s.file, []);

  const count = (o) => tests.filter((t) => t.outcome === o).length;
  const passed = count("expected");
  const knownFailures = count("knownFailure");
  const failed = count("unexpected");
  const flaky = count("flaky");
  const skipped = count("skipped");
  const executed = tests.length - skipped;

  const byFile = new Map();
  for (const t of tests) {
    const e = byFile.get(t.file) || {
      file: t.file,
      total: 0,
      passed: 0,
      failed: 0,
      flaky: 0,
      skipped: 0,
      knownFailures: 0,
      duration: 0,
    };
    e.total++;
    e.duration += t.duration;
    if (t.outcome === "expected") e.passed++;
    else if (t.outcome === "unexpected") e.failed++;
    else if (t.outcome === "flaky") e.flaky++;
    else if (t.outcome === "skipped") e.skipped++;
    else if (t.outcome === "knownFailure") e.knownFailures++;
    byFile.set(t.file, e);
  }

  return {
    total: tests.length,
    passed,
    failed,
    flaky,
    skipped,
    knownFailures,
    // Known failures (test.fail) behave as designed, so they count towards the pass rate.
    passRate: executed ? round(((passed + knownFailures + flaky) / executed) * 100) : 0,
    durationMs: Math.round(results.stats?.duration ?? tests.reduce((s, t) => s + t.duration, 0)),
    startTime: results.stats?.startTime || null,
    files: [...byFile.values()].sort((a, b) => a.file.localeCompare(b.file)),
    failures: tests
      .filter((t) => t.outcome === "unexpected" || t.outcome === "flaky")
      .map(({ file, title, outcome, error, retries }) => ({ file, title, outcome, error, retries })),
    knownFailureTests: tests.filter((t) => t.outcome === "knownFailure").map(({ file, title }) => ({ file, title })),
    slowest: [...tests]
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 8)
      .map(({ file, title, duration }) => ({ file, title, duration })),
    globalErrors: (results.errors || []).map((e) => firstError({ errors: [e] })).filter(Boolean),
  };
}

/* ------------------------------------------------------------- coverage */

function resourceOf(p) {
  const seg = p.split("/").filter(Boolean)[0] || "/";
  return seg === "api" ? p.split("/").filter(Boolean)[1] || "api" : seg;
}

function summarizeCoverage(report, gaps) {
  const groups = new Map();
  for (const op of report.operations || []) {
    if (!op.inScope) continue;
    const key = resourceOf(op.path);
    const g = groups.get(key) || {
      resource: key,
      operations: { covered: 0, total: 0 },
      statuses: { covered: 0, total: 0 },
      parameters: { covered: 0, total: 0 },
      requests: 0,
    };
    g.operations.total++;
    if (op.covered) g.operations.covered++;
    g.requests += op.requests || 0;
    for (const s of op.statuses || []) {
      if (!s.documented) continue;
      g.statuses.total++;
      if (s.requests > 0) g.statuses.covered++;
    }
    for (const prm of op.parameters || []) {
      g.parameters.total++;
      if (prm.covered || prm.requests > 0) g.parameters.covered++;
    }
    groups.set(key, g);
  }
  const resources = [...groups.values()]
    .map((g) => ({
      ...g,
      operations: { ...g.operations, percent: pct(g.operations.covered, g.operations.total) },
      statuses: { ...g.statuses, percent: pct(g.statuses.covered, g.statuses.total) },
      parameters: { ...g.parameters, percent: pct(g.parameters.covered, g.parameters.total) },
    }))
    .sort((a, b) => a.resource.localeCompare(b.resource));

  const inScopeOps = (report.operations || []).filter((o) => o.inScope);
  const scopeGaps = (gaps || []).filter((g) => g.inScope);

  return {
    summary: report.summary,
    resources,
    operations: inScopeOps.map((o) => ({
      id: o.id,
      method: o.method,
      path: o.path,
      covered: o.covered,
      requests: o.requests || 0,
      statuses: (o.statuses || [])
        .filter((s) => s.documented)
        .map((s) => ({ status: s.status, covered: s.requests > 0 })),
    })),
    gaps: {
      total: (gaps || []).length,
      inScope: scopeGaps.length,
      byType: ["operation", "status", "param"].reduce(
        (acc, t) => ({ ...acc, [t]: scopeGaps.filter((g) => g.type === t).length }),
        {}
      ),
      items: scopeGaps.map((g) => ({ id: g.id, type: g.type, method: g.method, path: g.path })),
    },
    waivers: (report.waivers || []).map(({ id, kind, reason, covered }) => ({ id, kind, reason, covered })),
    drift: {
      unmatchedRequests: (report.drift?.unmatchedRequests || []).length,
      undocumentedStatuses: (report.drift?.undocumentedStatuses || []).length,
      undocumentedParams: (report.drift?.undocumentedParams || []).length,
    },
    warnings: report.warnings || [],
    inputs: {
      openapi: report.inputs?.spec?.infoVersion || null,
      specSha: report.inputs?.spec?.sha256?.slice(0, 12) || null,
      operationsTotal: report.inputs?.spec?.operationsTotal ?? null,
      requestsCounted: report.inputs?.requests?.lines?.counted ?? null,
      requestsTotal: report.inputs?.requests?.lines?.total ?? null,
      scope: report.inputs?.config?.scope || [],
      tool: report.tool ? `${report.tool.name}@${report.tool.version}` : null,
    },
  };
}

/* ------------------------------------------------------------------ run */

function runMeta(args) {
  const env = process.env;
  const server = env.GITHUB_SERVER_URL || "https://github.com";
  const repo = env.GITHUB_REPOSITORY || "";
  const runId = args["run-id"] || env.GITHUB_RUN_ID || "local";
  const branch = args.branch || env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME || "local";
  return {
    id: String(runId),
    number: Number(args["run-number"] || env.GITHUB_RUN_NUMBER || 0),
    attempt: Number(env.GITHUB_RUN_ATTEMPT || 1),
    sha: args.sha || env.GITHUB_SHA || "",
    branch,
    event: args.event || env.GITHUB_EVENT_NAME || "local",
    actor: args.actor || env.GITHUB_ACTOR || "",
    createdAt: args["created-at"] || new Date().toISOString(),
    url: args["run-url"] || (repo && runId !== "local" ? `${server}/${repo}/actions/runs/${runId}` : ""),
    repository: repo,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.report || !args.out) {
    console.error(
      "usage: snapshot.js --report <report.json> [--gaps <gaps.json>] [--results <results.json>] --out <snapshot.json>"
    );
    process.exit(2);
  }
  const report = readJson(args.report);
  const gaps = args.gaps && fs.existsSync(args.gaps) ? readJson(args.gaps) : [];
  const results = args.results && fs.existsSync(args.results) ? readJson(args.results) : null;

  const snapshot = {
    schemaVersion: SCHEMA_VERSION,
    run: runMeta(args),
    tests: results ? summarizeTests(results) : null,
    coverage: summarizeCoverage(report, gaps),
  };

  fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(snapshot, null, 2) + "\n");
  const t = snapshot.tests;
  const s = snapshot.coverage.summary.scope.operations;
  console.log(
    `snapshot ${snapshot.run.id}: ` +
      (t ? `${t.passed}/${t.total} passed, ${t.failed} failed; ` : "no test results; ") +
      `scope operations ${s.covered}/${s.total} (${s.percent}%) -> ${args.out}`
  );
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = { summarizeTests, summarizeCoverage };
