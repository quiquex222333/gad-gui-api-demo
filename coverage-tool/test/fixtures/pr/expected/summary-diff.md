### API coverage (scope)

| Dimension | Base | Head | Δ |
|---|---:|---:|---:|
| operations | 5/6 (83.33%) | 5/7 (71.43%) | **-11.9 pp** ▼ (covered 0, total +1) |
| statuses | 4/8 (50.00%) | 4/9 (44.44%) | **-5.56 pp** ▼ (covered 0, total +1) |
| parameters | 6/7 (85.71%) | 5/8 (62.50%) | **-23.21 pp** ▼ (covered -1, total +1) |

**Gaps closed:** 2

- `GET /comments`
- `GET /comments#200`

**Gaps opened:** 3

- `GET /articles/search`
- `GET /articles/search#200`
- `GET /articles/search?query.query`

**Top open in-scope gaps:** 10 of 10

- `GET /articles/search`
- `PUT /articles/{id}`
- `POST /articles#422`
- `GET /articles/search#200`
- `GET /articles/{id}#404`
- `PUT /articles/{id}#200`
- `DELETE /articles/{id}#200`
- `POST /articles?body.body`
- `GET /articles/search?query.query`
- `PUT /articles/{id}?path.id`
