#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');

const { REPO_ROOT, TOOL_ROOT, toRepoRelative } = require('../src/paths');
const { loadConfig, InputError, sha256 } = require('../src/config');
const { loadSpec } = require('../src/spec-loader');
const { loadRequests } = require('../src/requests-loader');
const { analyze } = require('../src/analyze');
const { deriveGaps } = require('../src/gaps');
const { diffReports } = require('../src/diff');
const { formatReport, formatDiff } = require('../src/format-console');
const { writeJson } = require('../src/write-json');
const pkg = require('../package.json');

const HELP = `gad-coverage <command> [options]

Commands:
  report                      Compute coverage; write report.json and gaps.json
  diff <base.json> <head.json>  Compare two report.json files

report options:
  --spec <file>       OpenAPI spec (default: public/tools/schema/openapi_rest_demo.json)
  --requests <file>   Recorded requests JSONL (default: api-tests/.coverage/requests.jsonl)
  --config <file>     Config JSON (default: coverage-tool/coverage.config.json)
  --out-dir <dir>     Output directory (default: coverage-tool/out)

diff options:
  --out <file>        Also write diff.json
  --fail-on-opened    Exit 1 if any gap was opened (regression)

  -h, --help          Show this help

Exit codes: 0 ok, 1 regression (diff --fail-on-opened), 2 usage/input error.
`;

function emitWarnings(warnings) {
  for (const w of warnings) {
    process.stderr.write(`warning ${w.code}: ${w.message}${w.count > 1 ? ` (x${w.count})` : ''}\n`);
  }
}

async function cmdReport(values) {
  const specFile = path.resolve(values.spec || path.join(REPO_ROOT, 'public/tools/schema/openapi_rest_demo.json'));
  const reqFile = path.resolve(values.requests || path.join(REPO_ROOT, 'api-tests/.coverage/requests.jsonl'));
  const cfgFile = path.resolve(values.config || path.join(TOOL_ROOT, 'coverage.config.json'));
  const outDir = path.resolve(values['out-dir'] || path.join(TOOL_ROOT, 'out'));

  const config = loadConfig(cfgFile);
  const spec = await loadSpec(specFile);
  const requests = loadRequests(reqFile);

  const report = analyze(spec, requests, config, {
    toolVersion: pkg.version,
    specPath: toRepoRelative(specFile),
    requestsPath: toRepoRelative(reqFile),
    configPath: config.loaded ? toRepoRelative(cfgFile) : null,
  });
  const gaps = deriveGaps(report);

  const reportFile = path.join(outDir, 'report.json');
  const gapsFile = path.join(outDir, 'gaps.json');
  writeJson(reportFile, report);
  writeJson(gapsFile, gaps);

  emitWarnings(report.warnings);
  process.stdout.write(formatReport(report, [toRepoRelative(reportFile), toRepoRelative(gapsFile)]));
  return 0;
}

function readReport(file, label) {
  let buf;
  try {
    buf = fs.readFileSync(file);
  } catch (e) {
    throw new InputError(`Cannot read ${label} report ${file}: ${e.message}`);
  }
  try {
    return { json: JSON.parse(buf.toString('utf8')), sha256: sha256(buf) };
  } catch (e) {
    throw new InputError(`Invalid JSON in ${label} report ${file}: ${e.message}`);
  }
}

function cmdDiff(values, positionals) {
  if (positionals.length !== 2) throw new InputError('diff needs exactly two arguments: <base.json> <head.json>');
  const [baseFile, headFile] = positionals.map((p) => path.resolve(p));
  const base = readReport(baseFile, 'base');
  const head = readReport(headFile, 'head');
  const diff = diffReports(base.json, head.json, {
    basePath: toRepoRelative(baseFile),
    baseSha256: base.sha256,
    headPath: toRepoRelative(headFile),
    headSha256: head.sha256,
  });
  if (values.out) writeJson(path.resolve(values.out), diff);
  process.stdout.write(formatDiff(diff));
  return values['fail-on-opened'] && diff.gaps.opened.length > 0 ? 1 : 0;
}

async function main(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        help: { type: 'boolean', short: 'h' },
        spec: { type: 'string' },
        requests: { type: 'string' },
        config: { type: 'string' },
        'out-dir': { type: 'string' },
        out: { type: 'string' },
        'fail-on-opened': { type: 'boolean' },
      },
    });
  } catch (e) {
    process.stderr.write(`${e.message}\n\n${HELP}`);
    return 2;
  }
  const { values, positionals } = parsed;
  const [command, ...rest] = positionals;
  if (values.help || !command) {
    process.stdout.write(HELP);
    return values.help ? 0 : 2;
  }
  try {
    if (command === 'report') return await cmdReport(values);
    if (command === 'diff') return cmdDiff(values, rest);
    process.stderr.write(`Unknown command "${command}"\n\n${HELP}`);
    return 2;
  } catch (e) {
    if (e instanceof InputError) {
      process.stderr.write(`error: ${e.message}\n`);
      return 2;
    }
    throw e;
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e) => {
    process.stderr.write(`${e && e.stack ? e.stack : e}\n`);
    process.exit(70);
  },
);
