const recorder = require('../recorder');

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

class BaseClient {
  /**
   * @param {import('@playwright/test').APIRequestContext} request
   * @param {{source?: 'test'|'setup'}} [opts] "setup" for calls made by globalSetup/fixtures
   */
  constructor(request, { source = 'test' } = {}) {
    this.request = request;
    this.source = source;
  }

  /**
   * Single choke point for every HTTP call; records exactly one line per call.
   * @param {string} method
   * @param {string} pathTemplate OpenAPI path key without /api, e.g. '/articles/{id}'
   * @param {{pathParams?:object, params?:object, data?:any, headers?:object}} [opts]
   */
  async send(method, pathTemplate, opts = {}) {
    const { pathParams = {}, params, data, headers } = opts;
    const actualPath = pathTemplate.replace(/\{(\w+)\}/g, (_, name) => {
      if (!(name in pathParams)) {
        throw new Error(`Missing path param "${name}" for ${pathTemplate}`);
      }
      return encodeURIComponent(String(pathParams[name]));
    });

    // baseURL ends in "/api/": send a RELATIVE path (no leading slash) or "/api" is dropped.
    const relativePath = actualPath.replace(/^\/+/, '');

    const entry = {
      source: this.source,
      method: method.toUpperCase(),
      pathTemplate,
      actualPath,
      status: null,
      queryParams: Object.keys(params || {}).sort(),
      bodyFields: isPlainObject(data) ? Object.keys(data).sort() : [],
    };

    try {
      const response = await this.request.fetch(relativePath, {
        method: entry.method,
        params,
        data,
        headers,
      });
      entry.status = response.status();
      return response;
    } finally {
      recorder.record(entry);
    }
  }
}

module.exports = BaseClient;
