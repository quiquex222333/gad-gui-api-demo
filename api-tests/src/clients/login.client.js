const BaseClient = require('./base.client');

const PATHS = { login: '/login' };

class LoginClient extends BaseClient {
  login(email, password) {
    return this.send('POST', PATHS.login, { data: { email, password } });
  }

  validate() {
    return this.send('GET', PATHS.login);
  }
}

module.exports = LoginClient;
module.exports.PATHS = PATHS;
