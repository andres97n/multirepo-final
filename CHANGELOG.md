# Changelog

All notable changes to this project are documented here. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [Semantic Versioning](https://semver.org/).

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
