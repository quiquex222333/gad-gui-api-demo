const path = require('path');
const { defineConfig } = require('@playwright/test');
const config = require('./src/config');

const repoRoot = path.resolve(__dirname, '..');
const port = new URL(config.GAD_URL).port || '3005';

module.exports = defineConfig({
  testDir: 'tests',
  globalSetup: require.resolve('./src/global-setup'),
  workers: 1,
  fullyParallel: false,
  // The JSON reporter feeds the quality report (scripts/quality-report); keep its path in sync with the workflow.
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'reports/results.json' }],
  ],
  use: { baseURL: config.BASE_URL },
  webServer: {
    command: 'node server.js',
    cwd: repoRoot,
    env: { PORT: port },
    url: `${config.GAD_URL}/api/restore/list`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
