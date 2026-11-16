# ADR-0003 — Validation and OpenAPI from Zod

- Status: Accepted
- Date: 2026-11-15
- Supersedes: — / Superseded-by: —

## Context

M03 builds `apps/api` on NestJS 11 / Express 5 with Zod validation, a uniform
error envelope, request ids, redacted logs and OpenAPI generated from the
`@repo/contracts` Zod schemas (ADR-0002). Two decisions were open before coding:

1. Whether `nestjs-zod` + `@nestjs/swagger` + Zod 4 work together, or the
   `zod-openapi` fallback is needed.
2. How to resolve `@repo/contracts` types under the shared Nest tsconfig, whose
   `moduleResolution: Node10` ignores the package `exports` map.

## Decision

1. **nestjs-zod.** The spike (`createZodDto`, `ZodValidationPipe`,
   `cleanupOpenApiDoc`, `@ZodResponse`) works with `nestjs-zod@5.6.0`,
   `@nestjs/swagger@11.4.8` and `zod@4.6.7`. A `Health`-derived DTO appears in
   the generated OpenAPI document (as `HealthDto_Output`) with the full Zod
   shape. The `zod-openapi` fallback is not needed.
2. **Error envelope mapping.** A single catch-all `AllExceptionsFilter`
   renders `@repo/contracts` `ErrorEnvelope`s: Zod errors → 400
   `VALIDATION_FAILED` with field-level `details: [{path, message}]`;
   `HttpException` → `400 VALIDATION_FAILED`, `401 UNAUTHORIZED`,
   `403 FORBIDDEN`, `404 NOT_FOUND`, `409 CONFLICT`, `429 RATE_LIMITED`, else
   `INTERNAL`; unknown errors → 500 `INTERNAL` with a generic message and no
   stack in production (the stack is logged server-side). Every envelope
   carries the request id.
3. **Request id.** An incoming `x-request-id` is accepted only if it is a uuid
   or ulid of at most 64 characters; otherwise a uuid v7 (`uuid@11` `v7()`) is
   generated. The id is set as `req.id`, echoed as `x-request-id`, bound to an
   `AsyncLocalStorage` context, and reused by pino (`genReqId`/`customProps`)
   and the exception filter so the header, body and log line always agree.
4. **Type resolution.** `apps/api/tsconfig.json` overrides the shared
   `nest.json` to `module: NodeNext` / `moduleResolution: NodeNext`. Because
   `apps/api` has no `"type": "module"`, files stay CommonJS and the NodeNext
   resolver reads `@repo/contracts`' `exports` map (`require` → `.d.cts`),
   while still emitting the CommonJS that `node dist/main.js` runs. The build
   uses `tsc -p tsconfig.build.json` (the tsc builder), and unit/e2e tests run
   under vitest + `unplugin-swc` with `decoratorMetadata: true`; a DI smoke
   test proves class-typed constructor injection resolves under SWC.

## Alternatives

- `zod-openapi` fallback: unnecessary — rejected after the spike passed.
- Adding `main`/`types` to `@repo/contracts`: would let Node10 resolution work
  without touching the app tsconfig, but keeps the app on a resolution mode
  that ignores `exports`; overriding to NodeNext is the narrower, app-local fix.
- `@nestjs/config` + `dotenv`: rejected in favour of a plain Zod config
  provider and Node's built-in `process.loadEnvFile`.

## Consequences

- One validation/OpenAPI stack (`nestjs-zod` over `zod`), no DTO duplication.
- `apps/api` must stay CommonJS for the current build/run scripts; moving to
  ESM would be a separate change.
- Adding a secret env var is a one-line fragment addition; the production
  secret rule (≥ 32 bytes, not an example value) is enforced centrally.
