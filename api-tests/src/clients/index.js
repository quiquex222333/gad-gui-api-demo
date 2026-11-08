const LoginClient = require('./login.client');
const ArticlesClient = require('./articles.client');
const SystemClient = require('./system.client');
const CommentsClient = require('./comments.client');

function createClients(request) {
  return {
    login: new LoginClient(request),
    articles: new ArticlesClient(request),
    comments: new CommentsClient(request),
    system: new SystemClient(request),
  };
}

module.exports = {
  createClients,
  LoginClient,
  ArticlesClient,
  CommentsClient,
  SystemClient,
};
