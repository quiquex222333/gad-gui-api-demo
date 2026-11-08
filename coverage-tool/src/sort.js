'use strict';
// Canonical ordering (spec §9). All string comparison is by code unit, never localeCompare.

const METHOD_RANK = { GET: 0, POST: 1, PUT: 2, PATCH: 3, DELETE: 4, HEAD: 5, OPTIONS: 6, TRACE: 7 };
const TYPE_RANK = { operation: 0, status: 1, param: 2 };
const IN_RANK = { path: 0, query: 1, body: 2 };

function cmpStr(a, b) {
  a = a === undefined || a === null ? '' : a;
  b = b === undefined || b === null ? '' : b;
  return a < b ? -1 : a > b ? 1 : 0;
}

function cmpNum(a, b) {
  a = a === undefined || a === null ? 0 : a;
  b = b === undefined || b === null ? 0 : b;
  return a < b ? -1 : a > b ? 1 : 0;
}

function rank(table, key) {
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : 99;
}

// Works on operations, gaps and drift items (fields that are absent compare as equal).
function compareCanonical(a, b) {
  return (
    cmpStr(a.path, b.path) ||
    cmpNum(rank(METHOD_RANK, a.method), rank(METHOD_RANK, b.method)) ||
    cmpStr(a.method, b.method) ||
    cmpNum(rank(TYPE_RANK, a.type || 'operation'), rank(TYPE_RANK, b.type || 'operation')) ||
    cmpNum(a.status, b.status) ||
    cmpNum(rank(IN_RANK, a.in), rank(IN_RANK, b.in)) ||
    cmpStr(a.param !== undefined ? a.param : a.name, b.param !== undefined ? b.param : b.name) ||
    cmpStr(a.actualPath, b.actualPath)
  );
}

function sortCanonical(items) {
  return items.slice().sort(compareCanonical);
}

module.exports = { METHOD_RANK, TYPE_RANK, IN_RANK, cmpStr, cmpNum, compareCanonical, sortCanonical };
