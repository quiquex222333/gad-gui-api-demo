'use strict';
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const TOOL_ROOT = path.resolve(__dirname, '..');

// Repo-relative path with "/" separators. Paths outside the repo are returned normalised
// but without ".." resolution to absolute form, so outputs never leak absolute paths.
function toRepoRelative(p, root = REPO_ROOT) {
  const abs = path.resolve(p);
  let rel = path.relative(root, abs);
  rel = rel.split(path.sep).join('/');
  return rel === '' ? '.' : rel;
}

module.exports = { REPO_ROOT, TOOL_ROOT, toRepoRelative };
