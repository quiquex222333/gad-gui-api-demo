const LoginClient = require('./login.client');
const ArticlesClient = require('./articles.client');
const SystemClient = require('./system.client');
const CommentsClient = require('./comments.client');

function createClients(request, opts) {
  return {
    login: new LoginClient(request, opts),
    articles: new ArticlesClient(request, opts),
    comments: new CommentsClient(request, opts),
    system: new SystemClient(request, opts),
  };
}

module.exports = {
  createClients,
  LoginClient,
  ArticlesClient,
  CommentsClient,
  SystemClient,
};
