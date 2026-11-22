# Changelog

All notable changes to this project are documented here. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [Semantic Versioning](https://semver.org/).

## [0.3.0] - 2026-11-22

### Added

- **15:00 — `66437b3`, `e12e70d`, `d1005d5` feat(api): add db-core ports and Mongo adapter (M04)**
  - `infra/database/core`: `Repository`/`QueryTranslator`/`DatabaseHealth` ports, `DbError` family and a reusable repository contract suite.
  - `infra/database/mongo` (`@module:db-mongo`): Mongoose adapter with whitelisted filter/sort translation, regex escaping, `sanitizeFilter`, E11000 → `ConflictError`, background connect, health ping and `db:sync-indexes`.
  - `GET /api/v1/health/ready` (200 ok / 503 down); `/health/live` stays process-only.
  - `SERVICE_UNAVAILABLE` error code; `AllExceptionsFilter` maps `DbError`s (404, 409 with `details.field`, 400, 503).
  - `compose.dev.yaml` Mongo service and `pnpm dev:db`; `MONGO_URI`/`MONGO_TIMEOUT_MS` env.
  - ESLint `no-restricted-imports` keeps `mongoose`/`mongodb` inside the adapter; coverage gate ≥ 85% on `infra/database/**`.
  - ADR-0004 (DB behind ports; one primary engine per app).

### Security

- Bad client input can no longer cause a 500: Mongoose cast/validation errors map to 400 `VALIDATION_FAILED`, and object values for `eq`/`ne` are rejected by the translator.
- `MONGO_URI` is required in production (`.meta({ requiredInProduction: true })` is honoured by `composeEnvSchema`); `id`/`_id`/`$` keys are rejected on `create`/`update`.

### Changed

- Constants, types and the health interface live in their own files (`core/constants.ts`, `core/health.ts`, `mongo/mongo.constants.ts`, `mongo/mongo.types.ts`); driver-error mapping moved to `mongo/mongo-error.mapper.ts`.
- `compose.dev.yaml` host port is overridable with `MONGO_PORT`; `sync-indexes` awaits the connection first.

## [0.2.1] - 2026-11-15

### Fixed

- **21:10 — `12fb842` fix(api): exempt health from throttling and harden logging and secrets**
  - `GET /api/v1/health/live` is no longer rate limited, so Docker/orchestrator probes cannot get 429.
  - Fatal `uncaughtException`/`unhandledRejection` handlers emit one pino-shaped JSON line and exit 1.
  - Logged `req.url` drops the query string (no tokens in logs); the request id now has a single source (the middleware).
  - Production rejects low-entropy secrets (< 8 distinct characters); removed the unused `secretFragment` helper and the hard-coded Swagger title.

### Changed

- **`a0405aa` build(api): rename vitest configs to .mts** — removes the Vite ESM-in-CommonJS warning.

### Added

- **`894cc96` test(api): cover remaining AC gaps and restore env after e2e**
  - New tests: log-line request id, 200-char id replacement, HSTS, allowlisted CORS, docs UI 404 in production, never-throttled health.
  - `withEnv` test helper restores `process.env` even when assertions fail.

## [0.2.0] - 2026-11-15

### Added

- **20:32 — `e8c724f` feat(api): add NestJS api core (M03)**
  - `apps/api`: NestJS 11 / Express 5 app with `/api` prefix, URI versioning (`v1`), shutdown hooks and fatal-error handlers that log and exit non-zero.
  - Zod-validated env with a composable fragment builder; boot fails listing every invalid variable, and production rejects `CORS_ORIGIN` containing `*`/`null` and weak or example secrets.
  - Global `ZodValidationPipe` and `ZodSerializerInterceptor` (`nestjs-zod`) and a catch-all exception filter rendering the `ErrorEnvelope` (`VALIDATION_FAILED`, `NOT_FOUND`, `RATE_LIMITED`, `INTERNAL`) with `requestId`; 5xx messages are hidden in production.
  - Request-id middleware (uuid/ulid ≤ 64 chars accepted, else uuid v7) shared with pino; redacted JSON logs via nestjs-pino.
  - helmet, CORS allowlist (`credentials: false`), `@nestjs/throttler`, `GET /api/v1/health/live` and OpenAPI at `/api/docs` (off in production unless `API_DOCS_ENABLED=true`).
  - Vitest + SWC unit tests (97% line coverage on `common/` and `config/`) and supertest e2e tests; ADR-0003 (nestjs-zod, NodeNext resolution) and `apps/api/AGENTS.md`.

### Changed

- `pnpm-workspace.yaml`: `onlyBuiltDependencies` replaced by `allowBuilds` (`@swc/core` allowed) so the SWC install script can run.
- **`7e7e660` docs: tick M03 tasks and mark done** — M03 milestone and plan row set to Done.

## [0.1.0] - 2026-11-15

### Added

- **12:17 — `a55168b` feat(contracts): add zod contracts package (M02)**
  - `@repo/contracts` with Zod 4 schemas and inferred types: `successEnvelope`, `ErrorEnvelope` (requires `requestId`), `ErrorCode`, `PageQuery` / `paginated`, `filterSpec`, `Health`.
  - Prunable `auth` subpath: `Role`, `PASSWORD_POLICY`, `LoginInput` (email trimmed and lowercased), `Password`, `MeResponse`.
  - ESM + CJS + `.d.ts` builds via tsdown; export-resolution check per subpath; Vitest suite at 100% line coverage (threshold 90%).
  - `zod` is a peer dependency, so apps own the single zod version.
  - ADR-0002 (Zod contracts as single source) and `packages/contracts/AGENTS.md`.
- **11:18 — `c20941d` chore: add repo skeleton (M01)**
  - pnpm 11 + Turborepo workspace with Node 24, a single TypeScript 6.0.3, `minimumReleaseAge` and an empty `onlyBuiltDependencies` allowlist.
  - `@repo/config-typescript` (base, library, nest, next) and `@repo/config-eslint` (base, nest, next) presets; strict TS flags enabled.
  - Prettier, Husky pre-commit running lint-staged (eslint `--max-warnings 0`).
  - ADR template and ADR-0001 (monorepo and tooling); README and AGENTS.md stubs.
