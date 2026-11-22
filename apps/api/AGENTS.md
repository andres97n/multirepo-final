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

## Rules

- No `any` in `src/` (`@typescript-eslint/no-explicit-any` is `error`).
- `@repo/contracts` is the single source of truth for HTTP shapes; never
  redefine a shape here.
- Never log secrets: `authorization`, `cookie`, `set-cookie`, `password`,
  `token`, `refreshToken`, `accessToken` are redacted by the pino config.
- Compression is deliberately off (JSON API behind a reverse proxy that does
  gzip); revisit only with a measured reason.
