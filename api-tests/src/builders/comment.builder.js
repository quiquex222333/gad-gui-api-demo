const { uniqueId } = require('./unique');

function buildComment(overrides = {}) {
  const uid = uniqueId();
  return {
    article_id: uid,
    body: `here is the body ${uid}`,
    // One day back: the server rejects future dates and is timezone-sensitive.
    date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

module.exports = { buildComment };
