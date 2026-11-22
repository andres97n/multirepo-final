# ADR-0005 — Drizzle for the optional Postgres adapter

- Status: Accepted
- Date: 2026-11-22
- Supersedes: — / Superseded-by: —

## Context

ADR-0004 put persistence behind ports (`Repository`, `QueryTranslator`,
`DatabaseHealth`) with Mongo as the default adapter. M05 adds a relational
adapter that must pass the same contract suite unmodified, use bound parameters
only, and be swappable by editing `@module:db-*` marker regions plus `.env`.

## Decision

1. **Drizzle ORM over node-postgres** (`drizzle-orm`, `pg`) under
   `infra/database/postgres/`, the only place those packages (and `drizzle-kit`,
   `@electric-sql/pglite`) may be imported (`no-restricted-imports`).
2. **Tables spread `baseColumns`**: `id` uuid v7 generated app-side, `created_at`
   and `updated_at` maintained by the repository (not exposed on entities).
3. **Safe filters.** Drizzle operators only (`eq ne inArray gt gte lt lte ilike
arrayContains`); `contains` escapes `%`, `_` and `\`; values are coerced
   strictly to the column type (bad values are 400, never driver errors). No
   `sql.raw` or string-built SQL; a guard spec enforces it.
4. **Errors.** SQLSTATE `23505` → `ConflictError(field)`, with the field parsed from the
   constraint name. Unique constraints MUST be named `<table>_<column>_unique`.
   Malformed uuids are `NotFoundError`; connection failures are `DbUnavailableError`.
5. **Migrations are an explicit step**: `db:generate` (drizzle-kit) and `db:migrate`;
   the app never migrates on boot.
6. **Tests on PGlite** (in-process); each test file applies its own DDL. CI also runs
   e2e against a real Postgres service (M13) to cover PGlite differences.
7. **Pool.** `pg.Pool` from `DATABASE_URL`, size/timeouts from env, connects lazily
   (the app boots and stays live while Postgres is down), `pool.end()` on shutdown.
8. **Default build**: Mongo active, Postgres present but not wired (its marker regions
   are commented out). The scaffold script (M11) swaps them. Running both engines
   in one app still needs its own ADR.
9. **Roles.** compose.dev provisions a non-superuser `app` role for the app connection.

## Alternatives

- Prisma: rejected, heavier generated client/engine and less control over SQL shape.
- TypeORM/MikroORM: rejected in ADR-0004 (leaky abstraction over both engines).
- Raw `pg` + hand-written SQL: rejected, more injection surface and no typed schema.
- Running migrations on boot: rejected, races between instances and surprise DDL in prod.

## Consequences

- `pg` and `drizzle-orm` are runtime dependencies even in the default (Mongo) build until
  M11 prunes dependencies per selection.
- PGlite test DDL is hand-written and mirrors the test-only schema (`ponytail:` note).
- The conflict field depends on the constraint naming convention; it is tested.
