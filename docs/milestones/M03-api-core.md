# M03 — API core

| Field      | Value                                                                                              |
| ---------- | -------------------------------------------------------------------------------------------------- |
| Status     | Not started                                                                                        |
| Depends on | [M02](./M02-contracts.md)                                                                          |
| PRD refs   | FR-4.1 (live), FR-4.2, FR-4.3, NFR-SEC-1, NFR-SEC-2, NFR-SEC-7, NFR-QUAL-1, NFR-QUAL-2, NFR-QUAL-4 |
| Axes       | 1 (Modular), 2 (Contracts), 5 (Security/config), 7 (Observability)                                 |

## Goal

A NestJS 11 app with no database and no auth that already has validated config, contract-based validation, uniform errors, request ids, safe logging, baseline security middleware, a liveness endpoint and OpenAPI docs.

## Scope

`apps/api` bootstrap, `config/`, `common/`, `infra/logger`, `infra/health` (live only), OpenAPI, Vitest + SWC.

## Out of scope

- DB and readiness (M04), auth (M06), Docker (M12).

## Tasks

- [ ] Spike first: confirm nestjs-zod + @nestjs/swagger + Zod 4 work together. If not, switch to the `zod-openapi` fallback and record it in ADR-0003.
- [ ] Bootstrap:
  - Express 5, `/api` prefix, URI versioning `v1`, `enableShutdownHooks`.
  - `bufferLogs` + pino logger.
  - `trust proxy` configurable.
- [ ] `config/env.schema.ts`:
  - Zod schema built from core + module fragments; typed `AppConfig` provider.
  - Boot fails with a list of invalid variables.
  - Production rules: `CORS_ORIGIN` must not be `*`; secrets must be ≥ 32 bytes and not equal to example values.
- [ ] Global `ZodValidationPipe`; DTOs created from contract schemas.
- [ ] Global exception filter:
  - Maps Zod errors → `VALIDATION_FAILED` 400; Nest HttpExceptions → codes; unknown errors → `INTERNAL` 500.
  - 500 responses never leak the stack in production.
  - Always includes `requestId`.
- [ ] Request-id middleware:
  - Accepts incoming `x-request-id` only if it is a uuid/ulid ≤ 64 chars; otherwise generates a uuid v7.
  - Sets the response header and binds the id to the logger context (AsyncLocalStorage / nestjs-pino).
- [ ] nestjs-pino:
  - JSON in production, pretty in development.
  - Redact paths: `req.headers.authorization`, `req.headers.cookie`, `res.headers["set-cookie"]`, `*.password`, `*.token`, `*.refreshToken`, `*.accessToken`.
  - Minimal request serializers.
- [ ] helmet (api defaults; CSP off for JSON api), CORS allowlist from env with `credentials: false`, compression off by default (documented).
- [ ] `@nestjs/throttler`: global limits from env; 429 rendered through the error envelope.
- [ ] `GET /api/v1/health/live` → `Health` contract, always 200 while the process runs.
- [ ] OpenAPI generated from Zod at `/api/docs`. Disabled when `NODE_ENV=production` unless `API_DOCS_ENABLED=true`.
- [ ] Vitest config with `unplugin-swc` (decoratorMetadata) for unit tests; `vitest.e2e.config.ts` + supertest.
- [ ] Handlers for `unhandledRejection` / `uncaughtException` that log and exit non-zero.
- [ ] `apps/api/.env.example`, `apps/api/AGENTS.md` (short digest).

## Deliverables

`apps/api/src/{main.ts,app.module.ts,config/**,common/**,infra/logger/**,infra/health/**}`, `apps/api/test/**`, vitest configs, `.env.example`, `AGENTS.md`.

## Acceptance criteria

### Functional

- **AC-M03.1** `pnpm dev` starts the api, and `GET /api/v1/health/live` returns 200 with a body valid against `Health`.
- **AC-M03.2** A request with an invalid body returns 400 `ErrorEnvelope` with `code=VALIDATION_FAILED` and field-level `details`.
- **AC-M03.3** An unknown route returns 404 `ErrorEnvelope` with `code=NOT_FOUND`.
- **AC-M03.4** A thrown unknown error returns 500 `code=INTERNAL`, with no stack or message leakage in production mode.
- **AC-M03.5** Every response carries `x-request-id`. A valid incoming id is echoed, an invalid one (e.g. 200 chars or `<script>`) is replaced, and the same id appears in the error body and in the log line.
- **AC-M03.6** Exceeding the throttle limit returns 429 with `code=RATE_LIMITED` in the envelope.
- **AC-M03.7** `/api/docs` serves OpenAPI in development and returns 404 in production unless `API_DOCS_ENABLED=true`. The spec contains the health schema derived from Zod.

### Security

- **AC-M03.8** Boot fails, naming the variable, when: a required var is missing; `CORS_ORIGIN=*` in production; a secret is shorter than 32 bytes in production.
- **AC-M03.9** A log-capture test proves that `authorization`, `cookie`, `password` and token fields are redacted.
- **AC-M03.10** helmet headers are present (`x-content-type-options`, `x-frame-options`/`frame-ancestors`, no `x-powered-by`).
- **AC-M03.11** A CORS preflight from a non-allowlisted origin gets no `access-control-allow-origin`.

### Quality

- **AC-M03.12** Unit + e2e tests pass. Coverage threshold is set from the measured baseline (≥ 80% lines on `common/` and `config/`).
- **AC-M03.13** Lint 0 warnings and strict typecheck. No `any` in `src/` (`@typescript-eslint/no-explicit-any: error`).

### Observability

- **AC-M03.14** Production logs are single-line JSON with `level`, `time`, `requestId`, `req.method`, `req.url`, `res.statusCode` and `responseTime`.

### Docs

- **AC-M03.15** `.env.example` lists every variable with a comment. `apps/api/AGENTS.md` explains the folder roles. ADR-0003 (validation + OpenAPI approach) is written.

## Verification

```bash
pnpm --filter api test && pnpm --filter api test:e2e && pnpm --filter api build
curl -i localhost:3001/api/v1/health/live            # 200 + x-request-id
curl -i -H "x-request-id: <script>" localhost:3001/api/v1/health/live   # replaced id
NODE_ENV=production CORS_ORIGIN='*' node apps/api/dist/main.js   # exits non-zero, names CORS_ORIGIN
```

## ADRs produced

- ADR-0003 Validation and OpenAPI from Zod (nestjs-zod or fallback), error envelope and request id.

## Risks & mitigations

| Risk                                             | Mitigation                                                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| nestjs-zod incompatible with current Swagger/Zod | Spike first; fallback `zod-openapi`.                                                                        |
| SWC decorator metadata differences vs tsc        | Unit test that DI resolves a class-typed dependency; build with Nest CLI (tsc or swc) and match the config. |
| Express 5 path syntax in middleware              | Use the new wildcard syntax; test that the middleware applies to all routes.                                |

## Definition of Done

All ACs pass, ADR-0003 is merged, the commit is made and the status is set to Done.
