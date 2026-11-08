'use strict';
// Spec §6: "*" matches any sequence (including "/"); everything else is literal; whole-string match.

function globToRegExp(glob) {
  const body = glob
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\\/-]/g, '\\$&'))
    .join('.*');
  return new RegExp('^' + body + '$', 's');
}

function compileGlobs(globs) {
  return globs.map(globToRegExp);
}

function matchesAny(regexps, value) {
  return regexps.some((re) => re.test(value));
}

module.exports = { globToRegExp, compileGlobs, matchesAny };
