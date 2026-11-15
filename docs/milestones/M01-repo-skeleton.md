# M01 — Repo skeleton

| Field      | Value                                                     |
| ---------- | --------------------------------------------------------- |
| Status     | Not started                                               |
| Depends on | [M00](./M00-planning-docs.md)                             |
| PRD refs   | NFR-QUAL-1, NFR-QUAL-3, NFR-QUAL-4, NFR-MAINT-3, NFR-DX-1 |
| Axes       | 3 (Monorepo), 4 (Quality)                                 |

## Goal

An empty but fully gated pnpm + Turborepo workspace. Lint, typecheck, format and the pre-commit hook all work before any app exists.

## Scope

- Git repo, root config files, pnpm workspace, Turborepo pipeline.
- `packages/config-typescript` and `packages/config-eslint`.
- Prettier, Husky + lint-staged.
- ADR template and ADR-0001.

## Out of scope

- Apps, contracts, CI workflows (M13), Docker (M12).

## Tasks

- [ ] `git init`, initial branch `main`.
- [ ] `.gitignore`: node_modules, dist, .next, coverage, .turbo, `.env*` (except `.env.example`), agent state (.omc, .omo, .recall, .tasks, .scratch).
- [ ] `.gitattributes` (LF), `.editorconfig`, `.nvmrc` (24), `.npmrc` (`engine-strict=true`).
- [ ] Root `package.json`:
  - `private`, `packageManager` pnpm 11 (with hash), `engines`.
  - Scripts: `dev`, `build`, `lint`, `typecheck`, `test`, `test:e2e`, `format`, `format:check`. `modules:check` is added in M11.
  - `boilerplate.version: 0.0.0`.
- [ ] `pnpm-workspace.yaml`: `apps/*`, `packages/*`, `minimumReleaseAge`, `onlyBuiltDependencies` allowlist (empty for now).
- [ ] `turbo.json`:
  - `build`, `lint`, `typecheck`, `test`, `test:e2e`, `dev`, with correct `dependsOn`, `inputs` and `outputs`.
  - `env` declared per task; `globalDependencies` include the tsconfig and eslint presets.
- [ ] `packages/config-typescript`:
  - `base.json` (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax` where compatible).
  - `library.json`, `nest.json` (emitDecoratorMetadata, experimentalDecorators), `next.json`.
- [ ] `packages/config-eslint`:
  - `base.js`: @eslint/js + typescript-eslint `strictTypeChecked` + eslint-config-prettier.
  - `nest.js`, `next.js` (next plugin + react-hooks).
  - The package lints itself.
- [ ] `prettier.config.mjs` + `.prettierignore`.
- [ ] Husky `pre-commit` runs `lint-staged`. `lint-staged.config.mjs`: prettier --write on all staged files, eslint --fix --max-warnings 0 on staged TS/JS.
- [ ] Verify that the latest stable TS works with typescript-eslint. Otherwise pin the newest compatible version (see ADR-0001).
- [ ] `docs/adr/0000-template.md`, `docs/adr/0001-monorepo-and-tooling.md`.
- [ ] Minimal `README.md` (quick start placeholder) and `AGENTS.md` stub that points to `docs/`.

## Deliverables

Root config files, `packages/config-typescript/*`, `packages/config-eslint/*`, `.husky/pre-commit`, `docs/adr/0000-template.md`, `docs/adr/0001-monorepo-and-tooling.md`.

## Acceptance criteria

### Functional

- **AC-M01.1** `pnpm install` on a clean clone succeeds with Node 24 and pnpm 11. Any other package manager is refused (`only-allow` or `packageManager` + `engine-strict`).
- **AC-M01.2** `pnpm lint`, `pnpm typecheck` and `pnpm format:check` exit 0.
- **AC-M01.3** A second `pnpm turbo run lint typecheck` is a full cache hit (`FULL TURBO`).
- **AC-M01.4** Changing a file in `packages/config-typescript` invalidates the typecheck cache of every workspace.

### Quality

- **AC-M01.5** A staged file with a lint error blocks the commit. A staged mis-formatted file is auto-formatted by the hook.
- **AC-M01.6** ESLint runs with `--max-warnings 0` in every workspace.
- **AC-M01.7** The tsconfig presets enable `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`, and no workspace overrides them to false.
- **AC-M01.8** Exactly one `typescript` version is resolved in the lockfile.

### Security

- **AC-M01.9** `.env` and `.env.*` (except `.env.example`) are gitignored. `git check-ignore apps/api/.env` returns a match.
- **AC-M01.10** `minimumReleaseAge` is set, and `onlyBuiltDependencies` exists, so install scripts are opt-in.

### Docs

- **AC-M01.11** ADR template has sections: Status, Context, Decision, Alternatives, Consequences, Supersedes/Superseded-by.
- **AC-M01.12** ADR-0001 records: pnpm, Turborepo, TS version and why, eslint-config-prettier instead of eslint-plugin-prettier, Vitest as the single test runner, Node 24.

## Verification

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm format:check
pnpm turbo run lint typecheck   # second run -> FULL TURBO
echo "const a = 1" > packages/config-eslint/tmp.ts && git add . && git commit -m test   # must fail
pnpm why typescript             # single version
git check-ignore -v apps/api/.env
```

## ADRs produced

- ADR-0001 Monorepo and tooling (pnpm, Turbo, TS, ESLint/Prettier, Node).

## Risks & mitigations

| Risk                                                 | Mitigation                                                                                          |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Latest TS is unsupported by typescript-eslint / Next | Pin the newest compatible version; record it in ADR-0001; Renovate group handles the upgrade later. |
| Husky hooks are not installed on Windows / Git Bash  | `prepare: husky` script; verify on Windows during this milestone.                                   |
| `exactOptionalPropertyTypes` friction with libraries | Keep it enabled; document local workarounds; never disable it globally.                             |

## Definition of Done

All ACs pass, a commit is made with this milestone, and the milestone status is set to Done.
