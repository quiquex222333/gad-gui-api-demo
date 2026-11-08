const { uniqueId } = require('./unique');

function buildArticle(overrides = {}) {
  const uid = uniqueId();
  return {
    title: `QA article ${uid}`,
    body: `Body of QA article ${uid}`,
    // One day back: the server rejects future dates and is timezone-sensitive.
    date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    image: '',
    ...overrides,
  };
}

module.exports = { buildArticle };
