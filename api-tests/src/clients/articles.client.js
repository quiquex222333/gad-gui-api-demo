const BaseClient = require('./base.client');

const PATHS = { list: '/articles', item: '/articles/{id}', archive: '/articles/{id}/archive' };

class ArticlesClient extends BaseClient {
  list(params) {
    return this.send('GET', PATHS.list, { params });
  }

  get(id) {
    return this.send('GET', PATHS.item, { pathParams: { id } });
  }

  create(data, headers) {
    return this.send('POST', PATHS.list, { data, headers });
  }

  put(id, data, headers) {
    return this.send('PUT', PATHS.item, { pathParams: { id }, data, headers });
  }

  patch(id, data, headers) {
    return this.send('PATCH', PATHS.item, { pathParams: { id }, data, headers });
  }

  delete(id, data, headers) {
    return this.send('DELETE', PATHS.item, { pathParams: { id }, data, headers });
  }

  head(id, data, headers) {
    return this.send('HEAD', PATHS.item, { pathParams: { id }, data, headers });
  }

  archive(id) {
    return this.send('POST', PATHS.archive, { pathParams: { id } });
  }
}

module.exports = ArticlesClient;
module.exports.PATHS = PATHS;
