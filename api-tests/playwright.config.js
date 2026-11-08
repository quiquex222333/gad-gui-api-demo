const { defineConfig } = require('@playwright/test');
const config = require('./src/config');

module.exports = defineConfig({
  testDir: 'tests',
  globalSetup: require.resolve('./src/global-setup'),
  workers: 1,
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: config.BASE_URL },
});
