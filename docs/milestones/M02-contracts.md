# M02 — Contracts package

| Field      | Value                                                          |
| ---------- | -------------------------------------------------------------- |
| Status     | Done                                                           |
| Depends on | [M01](./M01-repo-skeleton.md)                                  |
| PRD refs   | §4.1 contracts, §7 data model, FR-2.10, NFR-QUAL-1, NFR-QUAL-2 |
| Axes       | 2 (Shared contracts), 3 (Monorepo)                             |

## Goal

`@repo/contracts` is the single source of truth for HTTP shapes. It contains Zod 4 schemas plus inferred types, is built for both ESM and CJS consumers, and is unit tested.

## Scope

Schemas for envelopes, error codes, pagination, filters, health and auth (auth lives in its own prunable subpath).

## Out of scope

- Nest DTO wiring (M03), web forms (M09), OpenAPI generation (M03).

## Tasks

- [x] `packages/contracts` package with `exports` map: `.`, `./http`, `./errors`, `./pagination`, `./filters`, `./health`, `./auth`.
- [x] `http/`: `successEnvelope(schema)` factory, `ErrorEnvelope` (`code`, `message`, `details?`, `requestId`).
- [x] `errors/`: `ErrorCode` enum (VALIDATION_FAILED, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, CONFLICT, RATE_LIMITED, INTERNAL).
- [x] `pagination/`: `PageQuery` (page ≥ 1 default 1, limit 1..100 default 20, `sort` as `field:asc|desc`), `paginated(schema)` factory.
- [x] `filters/`: `filterSpec({ allowedFields, allowedOps })` builder. It rejects unknown fields and operators.
- [x] `health/`: `Health` (`status: ok|degraded|down`, `checks` record).
- [x] `auth/` (module `auth`):
  - `LoginInput` (email trimmed and lowercased, password policy), `MeResponse`, `Role` (`user|admin`), `PASSWORD_POLICY` constants.
- [x] tsdown build: ESM + CJS + `.d.ts`, sourcemaps.
- [x] Vitest unit tests with a coverage threshold.
- [x] `packages/contracts/AGENTS.md` (short): contract-first rule, how to add a schema.

## Deliverables

`packages/contracts/src/**`, `tsdown.config.ts`, `vitest.config.ts`, `package.json` (exports), `AGENTS.md`.

## Acceptance criteria

### Functional

- **AC-M02.1** `PageQuery.parse({})` yields `{ page: 1, limit: 20 }`. `limit: 101`, `page: 0` and non-numeric strings are rejected. Numeric strings are coerced, since query params arrive as strings.
- **AC-M02.2** `filterSpec` rejects a field not in `allowedFields` and an operator not in `allowedOps`.
- **AC-M02.3** `LoginInput` normalizes `"  A@B.COM "` to `"a@b.com"`.
- **AC-M02.4** `successEnvelope(X)` and `paginated(X)` infer the correct TS types. A type-level test (`expectTypeOf`) proves this.
- **AC-M02.5** `ErrorEnvelope` requires `requestId`.
- **AC-M02.6** Package resolves from ESM (`import`) and CJS (`require`). A test script checks both entry points per subpath.

### Quality

- **AC-M02.7** Line coverage ≥ 90% (the package is pure logic).
- **AC-M02.8** No runtime dependency other than `zod`.
- **AC-M02.9** Lint 0 warnings and strict typecheck.

### Module-awareness

- **AC-M02.10** Deleting `src/auth/` and its `exports` entry still builds and tests green. This proves the subpath is prunable for M11.

### Docs

- **AC-M02.11** `packages/contracts/AGENTS.md` explains the contract-first flow.
- **AC-M02.12** ADR-0002 "Zod contracts as single source" is written.

## Verification

```bash
pnpm --filter @repo/contracts build test
node -e "require('@repo/contracts/pagination')"            # CJS
node --input-type=module -e "import('@repo/contracts/pagination')"   # ESM
pnpm --filter @repo/contracts test -- --coverage
```

## ADRs produced

- ADR-0002 Zod schemas in `packages/contracts` as the single source of truth (replaces class-validator + drift check).

## Risks & mitigations

| Risk                                            | Mitigation                                                              |
| ----------------------------------------------- | ----------------------------------------------------------------------- |
| Dual-package hazard (ESM and CJS copies of zod) | Contracts declares zod as a `peerDependency`; apps own the zod version. |
| Zod 4 API changes in minors                     | Pin exact; Renovate group with tests.                                   |

## Definition of Done

All ACs pass, ADR-0002 is merged, the commit is made and the status is set to Done.
