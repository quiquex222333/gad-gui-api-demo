const recorder = require('../recorder');

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

class BaseClient {
  constructor(request) {
    this.request = request;
  }

  /**
   * Single choke point for every HTTP call; records exactly one line per call.
   * @param {string} method
   * @param {string} pathTemplate e.g. '/api/articles/{id}' (constant, spec key)
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

    const entry = {
      method: method.toUpperCase(),
      pathTemplate,
      actualPath,
      status: null,
      queryParams: Object.keys(params || {}).sort(),
      bodyFields: isPlainObject(data) ? Object.keys(data).sort() : [],
    };

    try {
      const response = await this.request.fetch(actualPath, {
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
