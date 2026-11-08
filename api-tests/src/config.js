const path = require('path');

const GAD_URL = process.env.GAD_URL ?? 'http://localhost:3005';

module.exports = {
  // baseURL ends with "/api/": client paths MUST be relative (no leading slash),
  // otherwise Playwright resolves them against the origin and drops "/api".
  BASE_URL: `${GAD_URL}/api/`,
  GAD_URL,
  GAD_USER: process.env.GAD_USER || 'Moses.Armstrong@Feest.ca',
  GAD_PASSWORD: process.env.GAD_PASSWORD || 'test1',
  COVERAGE_FILE:
    process.env.COVERAGE_FILE ||
    path.resolve(__dirname, '..', '.coverage', 'requests.jsonl'),
};
