# ADR-0004 — DB behind ports; one primary engine per app

- Status: Accepted
- Date: 2026-11-22
- Supersedes: — / Superseded-by: —

## Context

Feature modules must not depend on a database driver (FR-3.1), driver errors must
become uniform HTTP envelopes (FR-3.2), and every adapter must behave the same
(FR-3.3). M04 introduces the first adapter (MongoDB / Mongoose); M05 adds Postgres.

## Decision

1. **Ports in `infra/database/core`** (zero driver imports, enforced by a guard
   test): `Repository<T, Id>` (`findById`, `findOne`, `findMany`, `create`,
   `update`, `delete`, `exists`), a `QueryTranslator`, `DatabaseHealth`, DI tokens
   and `DbError` (`NotFoundError`, `ConflictError(field?)`, `DbUnavailableError`,
   `InvalidQueryError`). The port stays small; feature repositories may add
   specific methods in their own ports.
2. **Adapters own the driver.** `mongoose`/`mongodb` can only be imported under
   `infra/database/mongo/` (ESLint `no-restricted-imports`).
3. **Error mapping in one place.** `AllExceptionsFilter` maps `DbError` to the
   envelope: 404 `NOT_FOUND`, 409 `CONFLICT` (`details.field`), 400
   `VALIDATION_FAILED`, 503 `SERVICE_UNAVAILABLE` (new contract code; generic
   message, never driver text or URIs). Malformed ids are `NotFoundError`, never 500.
4. **Safe filters.** Only the whitelisted operators `eq ne in gt gte lt lte contains`;
   fields and sort keys must be whitelisted per repository; `contains` escapes the
   regex; no `$where`/`$expr`/user `$` keys. Mongoose `sanitizeFilter` stays on
   globally; the translator marks its own whitelisted clauses with
   `mongoose.trusted()` because `sanitizeFilter` would otherwise turn every
   operator object into a literal `$eq`.
5. **Contract suite.** `core/testing/repository.contract.ts` is run against every
   adapter (Mongo on mongodb-memory-server now, Postgres on PGlite in M05).
6. **Readiness.** `GET /health/ready` aggregates `DATABASE_HEALTH` (200 ok / 503
   down); `/health/live` never touches the DB. The Mongo connection is opened in
   the background, so the app boots and stays live while Mongo is down.
7. **One primary engine per app.** Mixing two engines needs its own ADR.
   `autoIndex` is off in production; indexes are synced by `pnpm --filter api db:sync-indexes`.

## Alternatives

- Use Mongoose models directly in features: rejected, couples features to the driver.
- A generic ORM (TypeORM/MikroORM) over both engines: rejected, a leakier and larger abstraction than a small port.
- Fail boot when the DB is down: rejected, it would break liveness and rolling restarts.

## Consequences

- Swapping the engine is an adapter swap plus the contract suite, not a feature rewrite.
- Adapters carry translation code (filters, sort, errors) that must stay in sync with the contract suite.
- Fixed-interval reconnect (`ponytail:` note): add backoff/jitter if many instances start together.
