const fs = require('fs');
const path = require('path');
const config = require('./config');

// Read lazily so COVERAGE_FILE can be overridden at runtime (e.g. in tests).
function file() {
  return process.env.COVERAGE_FILE || config.COVERAGE_FILE;
}

function record(entry) {
  const f = file();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.appendFileSync(f, JSON.stringify(entry) + '\n');
}

function reset() {
  const f = file();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, '');
}

module.exports = { record, reset, file };
