# M05 — db-postgres (Drizzle)

| Field      | Value                                          |
| ---------- | ---------------------------------------------- |
| Status     | Not started                                    |
| Depends on | [M04](./M04-db-core-mongo.md)                  |
| PRD refs   | FR-3.1, FR-3.2, FR-3.3, FR-3.4, FR-4.1 (ready) |
| Axes       | 1 (Modular), 5 (Security), 6 (Infra)           |

## Goal

An optional PostgreSQL adapter built on Drizzle. It is interchangeable with Mongo: it passes the same contract suite, and switching engines only touches marker regions.

## Scope

`infra/database/postgres`, migrations tooling, PGlite-based tests, compose.dev postgres service, `@module:db-postgres` markers.

## Out of scope

- Auth tables (M06), running both engines at once (not supported without an ADR).

## Tasks

- [ ] `PostgresDatabaseModule.forRoot()`: node-postgres `Pool` from `DATABASE_URL`, pool size/timeouts from env, graceful pool shutdown.
- [ ] `PostgresRepository<T>` base on Drizzle: `id` uuid v7 (generated app-side), `created_at/updated_at` columns, `23505` → `ConflictError(field)` (parsed from constraint name), invalid uuid → `NotFoundError`.
- [ ] Filter translation through Drizzle operators only (`eq, ne, inArray, gt, gte, lt, lte, ilike` with escaped `%`/`_`). Never raw SQL with user input.
- [ ] `drizzle.config.ts`, `migrations/`, and scripts `db:generate` and `db:migrate`. Migrations never run on app boot.
- [ ] Health indicator: `select 1` with a timeout.
- [ ] Contract suite runs on PGlite (in-process). Schema for the test-only `Widget` table is pushed per test file.
- [ ] compose.dev `postgres` service with healthcheck and named volume.
- [ ] `// @module:db-postgres` markers in `app.module.ts`, env schema, `.env.example` and compose.
- [ ] Decide and document: the default base repo has mongo **active** and postgres **present but not wired**. The scaffold script (M11) swaps them.

## Deliverables

`apps/api/src/infra/database/postgres/**`, `drizzle.config.ts`, `migrations/`, compose.dev service, PGlite test helper.

## Acceptance criteria

### Functional

- **AC-M05.1** The same contract suite from M04 passes unmodified against the Postgres adapter on PGlite.
- **AC-M05.2** A duplicate unique key results in 409 `CONFLICT` with the field. A malformed uuid results in 404.
- **AC-M05.3** `db:generate` creates a migration from schema changes, and `db:migrate` applies it to compose.dev Postgres idempotently (a second run is a no-op).
- **AC-M05.4** With postgres wired, `/health/ready` returns 200 when PG is up and 503 when it is down.
- **AC-M05.5** The app boots and serves health against a real Postgres in compose.dev.

### Security

- **AC-M05.6** A `contains` filter with `%` or `_` is escaped (matches literally).
- **AC-M05.7** No `sql.raw` or string-concatenated SQL in the adapter. An ESLint rule or grep check in the test enforces this.
- **AC-M05.8** The DB user in compose.dev is not a superuser for the app connection (documented role setup).

### Architecture

- **AC-M05.9** Only `infra/database/postgres/**` imports `drizzle-orm` or `pg` (`no-restricted-imports`).
- **AC-M05.10** Swapping from mongo to postgres requires editing only `@module:db-*` marker regions plus `.env` (proven manually here, automated in M11).

### Quality

- **AC-M05.11** Coverage ≥ 85% on `infra/database/postgres/**`. Lint 0, strict typecheck.

### Docs

- **AC-M05.12** `apps/api/AGENTS.md` has a "Switching database engine" section. ADR-0004 gets a note on Drizzle (or a new ADR-0005 if the decision differs).

## Verification

```bash
pnpm --filter api test -- postgres
docker compose -f compose.dev.yaml up -d postgres
pnpm --filter api db:migrate && pnpm --filter api db:migrate   # second run no-op
# temporarily switch markers to postgres, then:
pnpm --filter api dev && curl -i localhost:3001/api/v1/health/ready
```

## ADRs produced

- ADR-0005 Drizzle for the optional Postgres adapter; migrations are an explicit step.

## Risks & mitigations

| Risk                                                           | Mitigation                                                                              |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| PGlite behavior differs from real Postgres                     | CI e2e also runs against a Postgres service container (M13).                            |
| Constraint-name parsing for the conflict field is brittle      | Naming convention `<table>_<column>_unique`; test it.                                   |
| Postgres deps stay installed while unused in the default build | M11 prunes deps per selection; until then they are devDependencies-only where possible. |

## Definition of Done

All ACs pass, ADR-0005 is merged, the commit is made and the status is set to Done.
