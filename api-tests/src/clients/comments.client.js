const BaseClient = require('./base.client');

const PATHS = { list: '/api/comments', item: '/api/comments/{id}' };

class CommentsClient extends BaseClient {
  list(params) {
    return this.send('GET', PATHS.list, { params });
  }

  get(id) {
    return this.send('GET', PATHS.item, { pathParams: { id } });
  }

  create(data) {
    return this.send('POST', PATHS.list, { data });
  }

  put(id, data) {
    return this.send('PUT', PATHS.item, { pathParams: { id }, data });
  }

  patch(id, data) {
    return this.send('PATCH', PATHS.item, { pathParams: { id }, data });
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
