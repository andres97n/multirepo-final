# Changelog

All notable changes to this project are documented here. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [Semantic Versioning](https://semver.org/).

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
