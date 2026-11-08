'use strict';
const fs = require('node:fs');
const path = require('node:path');

function stringify(value) {
  return JSON.stringify(value, null, 2) + '\n';
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, stringify(value), 'utf8');
}

module.exports = { stringify, writeJson };
