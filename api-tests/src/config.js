const path = require('path');

module.exports = {
  GAD_URL: process.env.GAD_URL || 'http://localhost:3000',
  GAD_USER: process.env.GAD_USER || 'Moses.Armstrong@Feest.ca',
  GAD_PASSWORD: process.env.GAD_PASSWORD || 'test1',
  COVERAGE_FILE:
    process.env.COVERAGE_FILE ||
    path.resolve(__dirname, '..', '.coverage', 'requests.jsonl'),
  API_PREFIX: '/api',
};
