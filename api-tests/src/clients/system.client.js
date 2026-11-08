const BaseClient = require('./base.client');

const PATHS = { restoreTestDb: '/api/restoreTestDB' };

class SystemClient extends BaseClient {
  restoreTestDb() {
    return this.send('GET', PATHS.restoreTestDb);
  }
}

module.exports = SystemClient;
module.exports.PATHS = PATHS;
