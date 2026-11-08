# Spec 003 – Article archive (`POST /articles/{id}/archive`)

Status: **draft**.

## 1. Goals
- Let an author archive an article without deleting it.
- Archived articles remain readable through `GET /articles/{id}` (and list).
- Expose the new fields `archived` and `archived_at` in the OpenAPI `Article` schema.

## 2. Non-goals
- Un-archive endpoint.
- Hiding archived articles from `GET /articles` lists, or filtering by `archived`.
- Changing `PUT`/`PATCH`/`POST /articles` validation (the new fields are server-managed, not client-writable).
- Tests (closed later by the CI `test-agent` job).

## 3. Requirements

| ID | Level | Requirement |
|----|-------|-------------|
| R1 | MUST | `POST /api/articles/{id}/archive` requires a Bearer JWT. |
| R2 | MUST | Only the article owner (token email matches the article's `user_id` user) or an admin may archive. |
| R3 | MUST | On success the article is stored with `archived: true` and `archived_at` (ISO 8601 date-time, server time) and returned with 200. |
| R4 | MUST | Missing/invalid token, or an authenticated non-owner non-admin, returns 401. |
| R5 | MUST | Unknown article id returns 404. |
| R6 | MUST | Already archived article returns 409 and `archived_at` is not changed. |
| R7 | MUST | `GET /api/articles/{id}` still returns archived articles (200). |
| R8 | MUST | OpenAPI documents the operation, every status below, and `archived` / `archived_at` on `Article`. |

## 4. Endpoints

| Operation | Auth | Request params |
|-----------|------|----------------|
| `POST /articles/{id}/archive` | Bearer JWT, owner or admin | path `id` (integer or string, required); no body |
| `GET /articles/{id}` (existing) | none | path `id`; now may include `archived`, `archived_at` |

## 5. Statuses

| Operation | Status | Input that triggers it |
|-----------|--------|------------------------|
| `POST /articles/{id}/archive` | 200 | valid owner or admin token, article exists, not archived |
| `POST /articles/{id}/archive` | 401 | no `Authorization` header |
| `POST /articles/{id}/archive` | 401 | invalid token |
| `POST /articles/{id}/archive` | 401 | valid token of a user who is not the owner and not admin |
| `POST /articles/{id}/archive` | 404 | valid token, article id does not exist |
| `POST /articles/{id}/archive` | 409 | article already archived |
| `GET /articles/{id}` | 200 | archived article id |

Check order: token (401) → existence (404) → ownership (401) → already archived (409).

## 6. Validation
- `id` (path): matched against article ids by the existing id comparison (string/number tolerant); no match → 404.
- `archived`: boolean, absent on never-archived articles; set only by this endpoint.
- `archived_at`: string, `date-time`, set only by this endpoint.
- Request body is ignored.

## 7. Acceptance criteria
- Each row of the Statuses table is observed with curl against `PORT=3005`.
- `GET /articles/{id}` after archive returns 200 with `archived: true`.
- OpenAPI file parses and contains every status above under `responses`.

## 8. Open items
- Whether archived articles should be excluded from lists (out of scope here).
