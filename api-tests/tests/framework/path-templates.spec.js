const { test, expect } = require('@playwright/test');
const path = require('path');
const spec = require(path.resolve(__dirname, '../../../public/tools/schema/openapi_rest_demo.json'));

const ALLOWLIST = ['/restoreTestDB'];
const clients = {
  login: require('../../src/clients/login.client').PATHS,
  articles: require('../../src/clients/articles.client').PATHS,
  comments: require('../../src/clients/comments.client').PATHS,
  system: require('../../src/clients/system.client').PATHS,
};

for (const [name, paths] of Object.entries(clients)) {
  for (const [key, template] of Object.entries(paths)) {
    test(`${name}.${key} (${template}) exists in the OpenAPI spec`, () => {
      if (ALLOWLIST.includes(template)) return;
      expect(template.startsWith('/')).toBe(true);
      expect(template.startsWith('/api')).toBe(false);
      expect(Object.keys(spec.paths)).toContain(template);
    });
  }
}
