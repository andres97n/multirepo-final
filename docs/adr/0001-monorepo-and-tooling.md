# ADR-0001 — Monorepo and tooling

- Status: Accepted
- Date: 2026-11-15
- Supersedes: — / Superseded-by: —

## Context

The boilerplate needs one workspace with strict, cached quality gates before any app exists.

## Decision

- **pnpm 11** workspace; `packageManager` + `engine-strict` refuse other package managers. `minimumReleaseAge` and an empty `onlyBuiltDependencies` allowlist harden installs.
- **Turborepo** for task orchestration and caching; tsconfig and eslint presets are `globalDependencies`.
- **TypeScript 6.0.3**, pinned once at the root and in config packages. The latest stable (7.0.2) is outside typescript-eslint 8.72.2's peer range (`>=4.8.4 <6.1.0`), so we use the newest compatible release. Revisit when typescript-eslint supports 7.
- **ESLint 10** flat config with typescript-eslint `strictTypeChecked`, and **eslint-config-prettier** plus a separate Prettier run instead of eslint-plugin-prettier (faster; Prettier's own recommendation).
- **Vitest** is the single test runner across the repo.
- **Node 24 LTS**.

## Alternatives

- npm/yarn: weaker workspace and supply-chain controls.
- Nx: heavier than needed.
- eslint-plugin-prettier: slower, mixes formatting into lint.
- TypeScript 7: blocked by typescript-eslint support today.

## Consequences

- Exactly one TypeScript version in the lockfile.
- Upgrading TypeScript requires a typescript-eslint release that supports it.
