#!/usr/bin/env node
"use strict";
/**
 * Renders the static quality report (GitHub Pages) from the last N run snapshots.
 *
 *   node scripts/quality-report/build.js --snapshots <dir> --out <site-dir> [--limit 5]
 *
 * <dir> is searched recursively for snapshot.json files (one per CI run, see snapshot.js).
 * Runs are de-duplicated by run id, ordered by creation time and the newest --limit are kept;
 * the newest one is shown by default. Output: <site-dir>/index.html (self-contained, no external
 * requests) and <site-dir>/history.json (the same data, for tooling).
 */
const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith("--") || argv[i + 1] === undefined) throw new Error(`Bad argument near ${argv[i]}`);
    args[argv[i].slice(2)] = argv[i + 1];
  }
  return args;
}

function findSnapshots(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "snapshot.json") out.push(p);
    }
  };
  walk(dir);
  return out;
}

function loadRuns(dir, limit) {
  const byId = new Map();
  for (const file of findSnapshots(dir)) {
    try {
      const s = JSON.parse(fs.readFileSync(file, "utf8"));
      if (!s.run || !s.coverage) throw new Error("not a snapshot");
      const prev = byId.get(s.run.id);
      // A re-run attempt replaces the earlier attempt of the same run.
      if (!prev || (s.run.attempt || 1) >= (prev.run.attempt || 1)) byId.set(s.run.id, s);
    } catch (err) {
      console.warn(`skipping ${file}: ${err.message}`);
    }
  }
  return [...byId.values()]
    .sort((a, b) => String(a.run.createdAt).localeCompare(String(b.run.createdAt)))
    .slice(-limit);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.snapshots || !args.out) {
    console.error("usage: build.js --snapshots <dir> --out <site-dir> [--limit 5]");
    process.exit(2);
  }
  const limit = Number(args.limit || 5);
  const runs = loadRuns(args.snapshots, limit);
  if (!runs.length) throw new Error(`no snapshot.json found under ${args.snapshots}`);

  const data = { generatedAt: new Date().toISOString(), limit, runs };
  // Escape "<" so no string in the data can close the <script> element.
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  const template = fs.readFileSync(path.join(__dirname, "template.html"), "utf8");
  const html = template.replace('"__QUALITY_DATA__"', () => json);

  fs.mkdirSync(args.out, { recursive: true });
  fs.writeFileSync(path.join(args.out, "index.html"), html);
  fs.writeFileSync(path.join(args.out, "history.json"), JSON.stringify(data, null, 2) + "\n");
  fs.writeFileSync(path.join(args.out, ".nojekyll"), "");
  console.log(`quality report: ${runs.length} run(s) -> ${path.join(args.out, "index.html")}`);
  for (const r of runs) console.log(`  #${r.run.number || "-"} ${r.run.id} ${r.run.branch} ${r.run.createdAt}`);
}

try {
  main();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
