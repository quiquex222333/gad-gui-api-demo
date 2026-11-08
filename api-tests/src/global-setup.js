const { request } = require('@playwright/test');
const config = require('./config');
const recorder = require('./recorder');
const { SystemClient } = require('./clients');

module.exports = async function globalSetup() {
  if (process.env.COVERAGE_APPEND !== '1') recorder.reset();

  const ctx = await request.newContext({ baseURL: config.GAD_URL });
  try {
    let res;
    try {
      res = await new SystemClient(ctx).restoreTestDb();
    } catch (err) {
      throw new Error(
        `GAD server is not reachable at ${config.GAD_URL}. Start it first (e.g. "PORT=3000 node server.js") or set GAD_URL. Cause: ${err.message}`,
      );
    }
    if (res.status() !== 201) {
      throw new Error(
        `GET /api/restoreTestDB expected 201 but got ${res.status()} at ${config.GAD_URL}`,
      );
    }
  } finally {
    await ctx.dispose();
  }
};
