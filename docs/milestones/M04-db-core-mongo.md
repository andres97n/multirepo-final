# M04 — db-core + db-mongo

| Field      | Value                                                       |
| ---------- | ----------------------------------------------------------- |
| Status     | Done                                                        |
| Depends on | [M03](./M03-api-core.md)                                    |
| PRD refs   | FR-3.1, FR-3.2, FR-3.3, FR-4.1 (ready), NFR-SEC-7, NFR-DX-1 |
| Axes       | 1 (Modular), 5 (Security), 7 (Observability)                |

## Goal

Feature code depends only on database ports. MongoDB (Mongoose) is the default adapter. It passes a reusable repository contract test suite that every future adapter must also pass.

## Scope

`infra/database/core`, `infra/database/mongo`, `/health/ready`, compose.dev mongo service, `@module:db-mongo` markers.

## Out of scope

- Postgres (M05), auth repositories (M06), prod compose (M12).

## Tasks

- [x] `core/`:
  - `Repository<T, Id = string>` port: `findById`, `findOne(filter)`, `findMany(PageQuery, FilterSpec) → Paginated<T>`, `create`, `update(id, patch)`, `delete(id)`, `exists`.
  - `DbError` base + `NotFoundError`, `ConflictError(field?)`, `DbUnavailableError`.
  - DI tokens: `DATABASE_HEALTH`, `DATABASE_CONNECTION_NAME`.
  - Sort/filter translation interface that each adapter implements.
- [x] Global filter mapping: NotFound → 404 `NOT_FOUND`, Conflict → 409 `CONFLICT`, DbUnavailable → 503.
- [x] **Repository contract test suite** `core/testing/repository.contract.ts`:
  - Parameterized over `makeRepo()`; uses a sample `Widget` entity defined only in tests.
  - Covers CRUD, pagination bounds, sort, filter ops, unique conflict, not-found.
- [x] `mongo/`:
  - `MongoDatabaseModule.forRoot()` reads `MONGO_URI`, with connection timeouts and `autoIndex` off in production (indexes synced by an explicit `db:sync-indexes` script).
  - `MongoRepository<T>` base: `_id` → `id`, `toJSON` strips `__v`, `lean()` reads.
  - E11000 → `ConflictError` with field.
  - Filter translation uses only whitelisted operators (`eq, ne, in, gt, gte, lt, lte, contains`). `contains` escapes the regex. `$where`/`$expr` and user-supplied `$` keys are never passed through.
  - `sanitizeFilter` enabled globally.
  - Health indicator: `db.admin().ping()` with a timeout.
- [x] `GET /api/v1/health/ready`: aggregates `DATABASE_HEALTH` → 200 ok / 503 down.
- [x] `compose.dev.yaml` mongo service with healthcheck and named volume.
- [x] `// @module:db-mongo` … `// @end-module:db-mongo` markers in `app.module.ts`, env schema and `.env.example`.

## Deliverables

`apps/api/src/infra/database/{core,mongo}/**`, the ready endpoint, `compose.dev.yaml`, test helpers using mongodb-memory-server.

## Acceptance criteria

### Functional

- **AC-M04.1** The contract suite passes against the Mongo adapter on mongodb-memory-server.
- **AC-M04.2** `findMany` returns `{items,page,limit,total}`. `total` is correct when filtered, and `limit` > 100 is impossible because PageQuery enforces it.
- **AC-M04.3** A duplicate unique key results in 409 `CONFLICT` with the field name in `details`.
- **AC-M04.4** A missing id results in 404 `NOT_FOUND`. An invalid ObjectId string also results in 404, not 500.
- **AC-M04.5** `/health/ready` returns 200 with `checks.database.status=ok` when Mongo is up, and 503 when Mongo is stopped. `/health/live` stays 200 in both cases.

### Security

- **AC-M04.6** Filter value `{ "$gt": "" }` is treated as a literal, not an operator (NoSQL injection test).
- **AC-M04.7** A `contains` value with regex metacharacters (`.*`, `(a+)+`) is escaped (no ReDoS / wildcard match).
- **AC-M04.8** Sorting or filtering on a non-whitelisted field returns 400.

### Architecture

- **AC-M04.9** No file outside `infra/database/mongo/` imports `mongoose`. An ESLint `no-restricted-imports` rule enforces this.
- **AC-M04.10** `core/` has zero driver imports.

### Quality

- **AC-M04.11** Coverage ≥ 85% lines on `infra/database/**`. Lint 0, strict typecheck.

### Module-awareness

- **AC-M04.12** Marker regions for `db-mongo` are balanced and list everything needed to remove the adapter.

### Docs / DX

- **AC-M04.13** `pnpm dev:db` (compose.dev) starts Mongo healthy, and the api connects with only `.env.example` values.
- **AC-M04.14** ADR-0004 "DB behind ports; one primary engine per app" is written.

## Verification

```bash
pnpm --filter api test -- database
docker compose -f compose.dev.yaml up -d mongo && pnpm --filter api dev
curl -i localhost:3001/api/v1/health/ready   # 200
docker compose -f compose.dev.yaml stop mongo && curl -i localhost:3001/api/v1/health/ready   # 503
pnpm --filter api lint   # restricted-imports rule
```

## ADRs produced

- ADR-0004 Database ports and adapters; one primary engine per app.

## Risks & mitigations

| Risk                                                         | Mitigation                                                                      |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| mongodb-memory-server binary download is slow or flaky in CI | Pin the Mongo version and cache the binary directory.                           |
| Generic repository becomes a leaky abstraction               | Keep the port small; feature repos may add specific methods in their own ports. |
| `autoIndex` off forgets indexes                              | `db:sync-indexes` script documented and run in compose/deploy.                  |

## Definition of Done

All ACs pass, ADR-0004 is merged, the commit is made and the status is set to Done.
