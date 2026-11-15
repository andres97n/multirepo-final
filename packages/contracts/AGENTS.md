# @repo/contracts

Single source of truth for HTTP shapes. Zod 4 schemas + inferred types, built
for ESM and CJS consumers.

## Contract-first rule

HTTP request/response shapes are defined **here first**. `api` and `web` import
types and schemas from `@repo/contracts`; never redefine a shape elsewhere.

## Layout

- `src/http` — `successEnvelope`, `ErrorEnvelope`
- `src/errors` — `ErrorCode`, `ErrorCodes`
- `src/pagination` — `PageQuery`, `paginated`
- `src/filters` — `filterSpec`, `FilterOps`
- `src/health` — `Health`
- `src/auth` — `Role`, `LoginInput`, `Password`, `MeResponse` (prunable)

`src/index.ts` re-exports everything except `auth`.

## Adding a schema

1. Create `src/<name>/index.ts` with the schema + inferred type export.
2. Add a `tsdown.config.ts` entry and a `package.json` `exports` subpath.
3. Add colocated tests under `src/<name>/`.
4. Run the gates: `pnpm --filter @repo/contracts build test test:coverage check:exports lint typecheck`.

## Notes

- `auth` is a prunable module: it is imported by no other module and is not
  re-exported from `src/index.ts`.
- `zod` is a peer dependency; apps own the zod version.
