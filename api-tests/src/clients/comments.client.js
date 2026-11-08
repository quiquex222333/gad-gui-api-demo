const BaseClient = require('./base.client');

const PATHS = { list: '/comments', item: '/comments/{id}' };

class CommentsClient extends BaseClient {
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

  delete(id) {
    return this.send('DELETE', PATHS.item, { pathParams: { id } });
  }

  head(id) {
    return this.send('HEAD', PATHS.item, { pathParams: { id } });
  }
}

module.exports = CommentsClient;
module.exports.PATHS = PATHS;
