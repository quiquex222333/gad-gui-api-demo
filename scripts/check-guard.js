#!/usr/bin/env node
'use strict';
// Role guard over a commit range: node scripts/check-guard.js <base>..<head>
// Rules are keyed on the `Agent:` commit trailer; db/db.json is forbidden for everyone.
const { execFileSync } = require('node:child_process');

const RULES = {
  'test-generator': { only: ['api-tests/', 'docs/agent-runs/'] },
  'feature-developer': { never: ['api-tests/', 'coverage-tool/', '.github/'] },
};
const FORBIDDEN_FILES = ['db/db.json'];

const under = (file, prefix) => file === prefix.replace(/\/$/, '') || file.startsWith(prefix);

// commit: { sha, agents: string[], files: string[] } -> violation strings
function checkCommit({ sha, agents, files }) {
  const out = [];
  const short = sha.slice(0, 7);
  for (const f of files) {
    if (FORBIDDEN_FILES.includes(f)) out.push(`${short}: must not include ${f}`);
  }
  for (const agent of agents) {
    const rule = RULES[agent];
    if (!rule) continue;
    for (const f of files) {
      if (rule.only && !rule.only.some((p) => under(f, p))) {
        out.push(`${short}: Agent ${agent} may only touch ${rule.only.join(', ')} (touched ${f})`);
      }
      if (rule.never && rule.never.some((p) => under(f, p))) {
        out.push(`${short}: Agent ${agent} must not touch ${rule.never.join(', ')} (touched ${f})`);
      }
    }
  }
  return out;
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

function readCommits(range) {
  const shas = git('rev-list', '--no-merges', range).split('\n').filter(Boolean);
  return shas.map((sha) => {
    const trailers = git('show', '-s', '--format=%(trailers:key=Agent,valueonly,unfold)', sha);
    const agents = trailers.split('\n').map((s) => s.trim().toLowerCase()).filter(Boolean);
    // --no-renames so both sides of a rename count as touched.
    const files = git('diff-tree', '--no-commit-id', '--name-only', '-r', '--no-renames', '--root', sha)
      .split('\n').filter(Boolean);
    return { sha, agents, files };
  });
}

function main(argv) {
  const range = argv[0];
  if (!range) {
    process.stderr.write('usage: check-guard.js <base>..<head>\n');
    return 2;
  }
  let commits;
  try {
    commits = readCommits(range);
  } catch (e) {
    process.stderr.write(`error: cannot read commit range "${range}": ${e.message}\n`);
    return 2;
  }
  const violations = commits.flatMap(checkCommit);
  if (violations.length) {
    process.stderr.write(`check:guard failed (${violations.length}):\n${violations.map((v) => `  - ${v}`).join('\n')}\n`);
    return 1;
  }
  process.stdout.write(`check:guard ok (${commits.length} commit(s) in ${range})\n`);
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { checkCommit };
