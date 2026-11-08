const { isUndefined, areIdsEqual } = require("../helpers/compare.helpers");
const { searchForArticle, searchForUserWithEmail } = require("../helpers/db-operation.helpers");
const { formatErrorResponse, formatInvalidTokenErrorResponse } = require("../helpers/helpers");
const { logTrace } = require("../helpers/logger-api");
const {
  HTTP_OK,
  HTTP_UNAUTHORIZED,
  HTTP_NOT_FOUND,
  HTTP_CONFLICT,
} = require("../helpers/response.helpers");
const { verifyAccessToken } = require("../helpers/validation.helpers");
const DatabaseManager = require("../helpers/db.manager");

const archiveUrlRegex = /^\/api\/articles\/([^/?]+)\/archive\/?(\?.*)?$/;

/**
 * Handles POST /api/articles/{id}/archive.
 * @returns {boolean} true when the request was handled (response sent), false otherwise
 */
function handleArticleArchive(req, res, { isAdmin }) {
  const urlEnds = req.url.replace(/\/\/+/g, "/");
  const match = req.method === "POST" ? archiveUrlRegex.exec(urlEnds) : null;
  if (match === null) {
    return false;
  }
  const articleId = decodeURIComponent(match[1]);

  const verifyTokenResult = verifyAccessToken(req, res, "articles/archive", req.url);
  if (isUndefined(verifyTokenResult)) {
    res.status(HTTP_UNAUTHORIZED).send(formatErrorResponse("Access token not provided!"));
    return true;
  }

  const foundArticle = searchForArticle(articleId);
  if (isUndefined(foundArticle)) {
    res.status(HTTP_NOT_FOUND).send(formatErrorResponse("Article not found"));
    return true;
  }

  const tokenUser = searchForUserWithEmail(verifyTokenResult?.email);
  const isOwner = !isUndefined(tokenUser) && areIdsEqual(tokenUser.id, foundArticle.user_id);
  logTrace("handleArticleArchive:", { articleId, isOwner, isAdmin });

  if (!isOwner && isAdmin !== true) {
    res.status(HTTP_UNAUTHORIZED).send(formatInvalidTokenErrorResponse());
    return true;
  }

  if (foundArticle.archived === true) {
    res.status(HTTP_CONFLICT).send(formatErrorResponse("Article is already archived"));
    return true;
  }

  const db = DatabaseManager.getInstance().getDb();
  const articles = db.get("articles");
  articles
    .find((article) => areIdsEqual(article.id, foundArticle.id))
    .assign({ archived: true, archived_at: new Date().toISOString() })
    .write();
  const updated = articles.find((article) => areIdsEqual(article.id, foundArticle.id)).value();

  res.status(HTTP_OK).send(updated);
  return true;
}

module.exports = {
  handleArticleArchive,
};
