# apps/api

NestJS 11 / Express 5 API. No auth yet; it owns validated config,
contract-based validation, a uniform error envelope, request ids, redacted pino
logs, baseline security middleware and the database ports + Mongo adapter.

## Folder roles

- `src/main.ts` — loads `.env`, validates config (exits 1 listing invalid vars),
  boots, and installs fatal `unhandledRejection`/`uncaughtException` handlers.
- `src/app.module.ts` — global `ZodValidationPipe`, `ZodSerializerInterceptor`,
  `AllExceptionsFilter` and `ThrottlerGuard`.
- `src/configure-app.ts` — `configureApp(app)`: prefix `api`, URI versioning,
  request-id middleware, helmet, CORS, `trust proxy`, OpenAPI. Shared by
  `main.ts` and the e2e helper (`test/helpers.ts`) so tests use the real wiring.
- `src/config/` — `env.schema.ts` (Zod schema from core + module fragments,
  production rules), `validate-env.ts`, `config.module.ts` (`APP_CONFIG`
  provider) and `app-config.ts`.
- `src/common/` — `filters/` (error envelope), `middleware/` (request id),
  `request-id.ts` and `request-context.ts` (AsyncLocalStorage).
- `src/infra/logger/` — nestjs-pino options (redaction, serializers).
- `src/infra/health/` — `GET /api/v1/health/live` (process only) and
  `GET /api/v1/health/ready` (aggregates `DATABASE_HEALTH`: 200 ok / 503 down).
- `src/infra/database/core/` — ports (`Repository`, `QueryTranslator`,
  `DatabaseHealth`), `DbError`s and the reusable contract suite
  (`testing/repository.contract.ts`). No driver imports allowed here.
- `src/infra/database/mongo/` — `@module:db-mongo`: `MongoDatabaseModule.forRoot()`
  (`MONGO_URI`, `MONGO_TIMEOUT_MS`), `MongoRepository`, `MongoQueryTranslator`,
  health indicator, `db:sync-indexes`. The only place `mongoose` may be imported.
  Constants live in `mongo.constants.ts`, types in `mongo.types.ts`, driver-error
  mapping in `mongo-error.mapper.ts`; `MONGO_URI` is required in production.
- `src/infra/database/postgres/` — `@module:db-postgres` (present, **not wired** by
  default): `PostgresDatabaseModule.forRoot()` (`DATABASE_URL`, `POSTGRES_*`),
  `PostgresRepository`, `PostgresQueryTranslator`, health indicator, `schema/`
  (`baseColumns`), `drizzle.config.ts` + `migrations/`. The only place `drizzle-orm`,
  `pg` and `@electric-sql/pglite` may be imported. See ADR-0005.
- `test/` — e2e specs (supertest); `test/helpers.ts` builds the app.

## How to add a config fragment

1. Add a Zod object fragment to `env.schema.ts` (core) or a new module fragment
   file, and merge it into `envSchema`. Production rules (`CORS_ORIGIN != "*"`,
   secrets >= 32 chars and not example values) live in the `superRefine`.
2. Pass the fragment to the schema builder so `AppConfig` exposes the parsed value.
3. Document the variable (with a comment) in `.env.example`.

## How to add a DTO from a contract schema

1. Define the shape in `packages/contracts` first (contract-first rule).
2. In the controller, build the DTO with `class XDto extends createZodDto(Schema) {}`
   and annotate the endpoint with `@ZodResponse(...)`. The global
   `ZodValidationPipe` validates any `@Body()/@Query()/@Param()` typed with a
   Zod DTO, and `@ZodResponse` drives response serialization + OpenAPI.

## Database rules

- Features depend on `infra/database/core` ports only; throw/catch `DbError`s, never driver errors.
- New repository: extend `MongoRepository`, pass its field whitelist, and run
  `runRepositoryContract` against it in a spec. Non-whitelisted filter/sort fields are 400.
- `autoIndex` is off in production: run `pnpm --filter api db:sync-indexes` on deploy.
- Local Mongo: `pnpm dev:db` (compose.dev.yaml). Tests use mongodb-memory-server.
- Postgres repositories: extend `PostgresRepository(db, table, fields)` with a table that
  spreads `baseColumns`; name unique constraints `<table>_<column>_unique` so conflicts
  report the field. Tests run the contract on PGlite (`testing/pglite.ts`).
- Postgres migrations are explicit: edit `src/infra/database/postgres/schema/`, then
  `pnpm --filter api db:generate` and `pnpm --filter api db:migrate` (never on boot).
  Local Postgres: `docker compose -f compose.dev.yaml up -d --wait postgres`; the app
  connects as the non-superuser `app` role (`docker/postgres/init/01-app-role.sql`).
- Real-DB proof (migrations, boot, `/health/ready` up/down/recovery): `bash scripts/live-check/api-health.sh <mongo|postgres>`; see "Live verification" in the root `AGENTS.md`.

## Docker image

`Dockerfile` (build from the repo root: `docker build -f apps/api/Dockerfile .`; ADR-0012):

1. `pruner` — `turbo prune api --docker`.
2. `deps` — `pnpm fetch` + `pnpm install --offline --frozen-lockfile` on the pruned manifests (store cache mount).
3. `build` — `turbo run build --filter=api`, then `pnpm --filter=api deploy --prod --legacy /prod/api` (`package.json#files` = `dist`, `migrations`).
4. `runtime` — `node:24-trixie-slim` by digest, npm/corepack/yarn removed, `USER node`, `HEALTHCHECK` on `/api/v1/health/live`, `node dist/main.js`.

Postgres migrations in a container: `docker compose run --rm api node dist/infra/database/postgres/migrate.js` (`migrate.ts`, explicit deploy step). Shutdown logs `shutting down (SIGTERM)` after the DB connections close (`infra/logger/logger.module.ts`).

## Switching database engine

Exactly one engine is wired per app. To switch Mongo → Postgres, touch only the
`@module:db-*` regions plus `.env`:

1. In `src/app.module.ts`, `src/config/env.schema.ts` (three regions) comment out the
   `db-mongo` regions and uncomment the `db-postgres` ones.
2. In `.env`, drop `MONGO_*` and set `DATABASE_URL` (see the `db-postgres` block of
   `.env.example`); `DATABASE_URL` is required in production.
3. Start Postgres (`docker compose -f compose.dev.yaml up -d --wait postgres`) and run
   `pnpm --filter api db:migrate`.
4. Feature repositories extend `PostgresRepository` instead of `MongoRepository`; the
   ports and the contract suite do not change. Mongo-specific specs (e.g. the
   `MONGO_URI` env tests) only apply while `db-mongo` is wired.

The scaffold script (M11) automates this. Running both engines at once needs an ADR.

## Auth module

`src/modules/auth/` (`@module:auth`, see ADR-0006). Local email + password login, Argon2id, 15-min HS256 access JWT, rotating refresh sessions with reuse detection, progressive lockout, RBAC (`user`, `admin`).

- **Endpoints** (`/api/v1`): `POST auth/login`, `POST auth/refresh`, `POST auth/logout`, `GET auth/me`, `GET users` (admin; paginated, filters `email` contains, `role` eq, `status` eq).
- **Protected by default.** A global `JwtAuthGuard` + `RolesGuard` guard every route.
  - Public route: add `@Public()` from `src/common/public.decorator.ts` (method or class).
  - Role-restricted route: add `@Roles('admin')` from `modules/auth/roles.decorator.ts`.
  - Current user: `@CurrentUser()` gives `{ id, roles, sid }`.
- **Repositories:** `UsersRepository` / `SessionsRepository` are abstract ports; Mongo and Postgres adapters live under `modules/auth/{mongo,postgres}` and bind via `mongoAuthProviders` / `postgresAuthProviders` inside the `@module:db-*` regions of `AuthModule`. Add new repository methods to both adapters and to `testing/auth-repositories.contract.ts`.
- **Env** (`auth.env.ts`, block in `.env.example`): `JWT_ACCESS_SECRET` (required in production), `JWT_*`, `REFRESH_*`, `ARGON2_*`, `LOCKOUT_*`, `AUTH_REVOCATION_CACHE_TTL_SECONDS`, `LOGIN_THROTTLE_*`, `SESSION_CLEANUP_INTERVAL_MINUTES`.
- **First admin:** `pnpm --filter api seed:admin` (reads `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` or prompts). Idempotent; never changes an existing password.
- **Session cleanup:** an interval in `AuthModule` calls `deleteExpired`; run `deleteExpired` from a script if you disable it.
- **Postgres:** `users`/`sessions` tables are in `schema/index.ts`; apply `migrations/` with `db:migrate`. Mongo: run `db:sync-indexes` on deploy.
- **Tests:** `test/auth.e2e-spec.ts` (Mongo) and `test/auth-postgres.e2e-spec.ts` (PGlite) run the same suite `test/auth-suite.ts`. Never log passwords or tokens; log `userId` or a hashed email.

## Rules

- No `any` in `src/` (`@typescript-eslint/no-explicit-any` is `error`).
- `@repo/contracts` is the single source of truth for HTTP shapes; never
  redefine a shape here.
- Never log secrets: `authorization`, `cookie`, `set-cookie`, `password`,
  `token`, `refreshToken`, `accessToken` are redacted by the pino config.
- Compression is deliberately off (JSON API behind a reverse proxy that does
  gzip); revisit only with a measured reason.
