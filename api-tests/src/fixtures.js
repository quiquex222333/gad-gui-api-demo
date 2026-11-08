const base = require('@playwright/test');
const config = require('./config');
const { createClients, LoginClient } = require('./clients');

const test = base.test.extend({
  authToken: [
    async ({ playwright }, use) => {
      const ctx = await playwright.request.newContext({ baseURL: config.GAD_URL });
      const res = await new LoginClient(ctx).login(config.GAD_USER, config.GAD_PASSWORD);
      if (res.status() !== 200) {
        throw new Error(`Seed user login failed with status ${res.status()}`);
      }
      const { access_token } = await res.json();
      await ctx.dispose();
      await use(access_token);
    },
    { scope: 'worker' },
  ],

  api: async ({ request }, use) => {
    await use(createClients(request));
  },

  authApi: async ({ playwright, authToken }, use) => {
    const ctx = await playwright.request.newContext({
      baseURL: config.GAD_URL,
      extraHTTPHeaders: { Authorization: `Bearer ${authToken}` },
    });
    await use(createClients(ctx));
    await ctx.dispose();
  },
});

module.exports = { test, expect: base.expect };
