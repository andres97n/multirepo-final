# AGENTS.md

Canonical instructions for every AI agent (Claude Code, OpenCode/OMO, others) working in this repo. `CLAUDE.md` imports this file, so edit here only.

This file describes the project **as it will be when all milestones (M00–M16) are done**. Some paths below don't exist yet. If a path is missing, its milestone hasn't landed: check the [progress table](#progress) and the milestone file before you create anything.

## Purpose

`multirepo-final` is a reusable **NestJS + Next.js + TypeScript monorepo boilerplate**. You clone it to start each new project. From day one it gives a project:

- A modular architecture where optional capabilities can be added or removed safely.
- Shared contracts between api and web.
- Strict quality gates, secure defaults, observability and container deployment.
- Docs written so AI agents can extend the code correctly.

It is built on eight axes:

1. Modular architecture
2. Shared contracts
3. Monorepo structure
4. Quality and testing
5. Security and configuration
6. Infrastructure and deployment
7. Observability
8. Documentation for AI

Maintenance cuts across all eight: Renovate, tests, gates and performance budgets.

The users are the owner (a solo dev) and AI agents. Agents must be able to work from this file, the docs and the skills alone.

## Architecture

```
            Browser
               │  (only an encrypted session cookie; never JWTs)
               ▼
   apps/web  (Next.js 16 — RSC + BFF route handlers + proxy.ts)
               │  Bearer access token + x-request-id
               ▼
   apps/api  (NestJS 11 — controllers → services → ports)
               │
     infra/database/core (ports, DbError, pagination, filters)
          ┌────┴─────┐
     mongo adapter   postgres adapter      ← exactly one per app
     (Mongoose)      (Drizzle)

   packages/contracts (Zod) ── used by api (validation + OpenAPI) and web (forms + types)
   packages/ui        (Tailwind v4 tokens + shadcn primitives) ── used by web
```

Principles:

- **Contract-first.** Any change to an HTTP shape starts in `packages/contracts`. The type errors it causes guide the rest of the change.
- **Ports and adapters only where they pay off.** That means the database layer. Elsewhere, Nest modules talk to each other directly.
- **Modules are removable.** An optional module touches shared files only inside `@module:<name>` … `@end-module:<name>` marker regions.
- **Secure by default, tunable per project.** Validated env sets the parameters of each control, but defaults can never be switched off.

## Structure

```
multirepo-final/
├─ apps/
│  ├─ api/                      NestJS 11 / Express 5 API — see apps/api/AGENTS.md
│  │  ├─ src/
│  │  │  ├─ main.ts             loads .env, validates config, boots, fatal handlers
│  │  │  ├─ app.module.ts       global pipe/serializer/filter/throttler + module wiring (markers)
│  │  │  ├─ configure-app.ts    prefix /api, URI versioning, request id, helmet, CORS, OpenAPI
│  │  │  ├─ config/             env.schema.ts (core + per-module Zod fragments), validate-env, APP_CONFIG
│  │  │  ├─ common/             error-envelope filter, request-id middleware + AsyncLocalStorage
│  │  │  ├─ infra/
│  │  │  │  ├─ logger/          nestjs-pino with redaction
│  │  │  │  ├─ health/          GET /api/v1/health/live (process) and /ready (DB)
│  │  │  │  └─ database/
│  │  │  │     ├─ core/         ports (Repository, QueryTranslator, DatabaseHealth), DbErrors, contract suite
│  │  │  │     ├─ mongo/        @module:db-mongo — Mongoose adapter (default)
│  │  │  │     └─ postgres/     @module:db-postgres — Drizzle adapter, schema/, PGlite test helper
│  │  │  └─ modules/auth/       @module:auth — users, sessions, guards, mongo/ + postgres/ repos
│  │  ├─ test/                  e2e (Vitest + supertest)
│  │  ├─ migrations/ · drizzle.config.ts    Postgres migrations (explicit step, never on boot)
│  │  └─ Dockerfile · vitest.config.mts · .env.example · AGENTS.md
│  └─ web/                      Next.js 16 / React 19 App Router
│     ├─ src/
│     │  ├─ app/                (public)/ · (auth)/login · (app)/dashboard · api/{health,auth/*} BFF handlers
│     │  ├─ proxy.ts            route protection + token refresh
│     │  ├─ lib/                env.ts · api-client.server.ts · session.ts · csrf.ts · csp.ts
│     │  └─ components/         business components (primitives come from packages/ui)
│     ├─ e2e/                   Playwright (auth / no-auth projects)
│     └─ Dockerfile · playwright.config.ts · vitest.config.ts · AGENTS.md
├─ packages/
│  ├─ contracts/                Zod 4 schemas + types, the single source of truth for HTTP shapes — see its AGENTS.md
│  ├─ ui/                       Tailwind v4 tokens, dark mode, accessible shadcn primitives
│  ├─ config-typescript/        base · nest · next · library tsconfig presets
│  └─ config-eslint/            base · nest · next flat-config presets
├─ scripts/modules.mjs          deterministic prune/apply of modules (used by /scaffold)
├─ scripts/live-check/          one-shot checks against real DBs in Docker (lib.sh, api-health.sh)
├─ modules.json                 module manifest: paths, deps, env, markers, docs, requires/conflicts
├─ perf-budgets.json · lighthouserc.json   performance budgets
├─ compose.dev.yaml · compose.yaml          dev services (mongo, postgres) / prod-like stack (ADR-0012)
├─ docker/                      {postgres,mongo}/init (least-privilege app users) · {api,web,mongo,postgres}.env.example for compose.yaml
├─ scripts/docker-smoke.mjs     pnpm docker:smoke (build, run, check, tear down)
├─ .github/workflows/ci.yml     calls the reusable workflows in platform-config (pinned by SHA; ADR-0013)
├─ scripts/ci-{prepare,changes}.mjs · scripts/audit-gate.mjs   CI glue: install/combo/env, matrix trigger, audit + exception expiry
├─ .security/exceptions.json    accepted findings with expiry (CI fails when one expires) · .gitleaks.toml (test-fixture allowlist)
├─ renovate.json                thin config extending the platform-config preset
├─ .claude/skills/{scaffold,adr}/SKILL.md · .claude/settings.json
├─ opencode.json                OpenCode/OMO permissions (AGENTS.md + .claude/skills are discovered natively)
├─ .husky/ · lint-staged.config.mjs · prettier.config.mjs · .editorconfig · .nvmrc · .npmrc
├─ AGENTS.md · CLAUDE.md · README.md · SECURITY.md · CHANGELOG.md · LICENSE
└─ docs/
   ├─ prd.md · plan.md          requirements and development plan
   ├─ milestones/Mxx-*.md       tasks, acceptance criteria (AC-Mxx.n), verification, DoD
   ├─ adr/NNNN-*.md             immutable decision records (template: 0000-template.md)
   └─ ARCHITECTURE.md · DEVELOPMENT-RULES.md · FORKING.md

platform-config/   (separate repo, public) Renovate preset + reusable workflows {quality,e2e,security,docker}
```

## Stack

| Area      | Choice                                                                                                         |
| --------- | -------------------------------------------------------------------------------------------------------------- |
| Monorepo  | pnpm 11 workspace, Turborepo, Node ≥ 24, one TypeScript version, strict everywhere                             |
| API       | NestJS 11, Express 5, nestjs-zod, nestjs-pino, helmet, @nestjs/throttler, @nestjs/swagger, @nestjs/jwt, argon2 |
| Web       | Next.js 16 (App Router, RSC), React 19, jose (encrypted session cookie)                                        |
| Contracts | Zod 4, built with tsdown (ESM + CJS)                                                                           |
| UI        | Tailwind v4, Radix/shadcn, class-variance-authority, tailwind-merge, lucide-react                              |
| Data      | Mongoose (default) **or** Drizzle + pg (optional); mongodb-memory-server / PGlite in tests                     |
| Quality   | Vitest + v8 coverage, Playwright, ESLint flat config, Prettier, husky + lint-staged                            |
| Ops       | Docker multi-stage `turbo prune` images (non-root, HEALTHCHECK), GitHub Actions, Renovate, Lighthouse CI       |

Deliberately excluded:

- class-validator and class-transformer (Zod replaces them).
- passport (plain guards are enough).
- bcrypt (Argon2id is used).
- eslint-plugin-prettier (Prettier runs on its own).

TanStack Query, next-intl, Redis, OpenTelemetry and API latency smoke tests are documented as optional integrations. They are not implemented.

## Modules

| Module        | Kind                                | Default |
| ------------- | ----------------------------------- | ------- |
| `db-mongo`    | DB engine (exactly one)             | Yes     |
| `db-postgres` | DB engine (exactly one)             | No      |
| `auth`        | Optional; the reference for modules | Yes     |

- **Markers.** A module's code in shared files lives only inside whole-line regions: `// @module:<name>` … `// @end-module:<name>` in TS/JS (and JSONC such as `turbo.json`), `# @module:<name>` … `# @end-module:<name>` in YAML/env. Regions may nest. Plain JSON (`package.json`) has no comments, so the manifest's `deps`, `packageScripts` and `packageExports` cover it.
- **Inactive engine.** The non-default engine (`db-postgres`) ships fully commented out inside its regions: commented code in TS, commented `KEY=value` lines in env files. Choosing it uncomments those regions (env description comments stay comments). Its regions must contain nothing else.
- **Manifest.** `modules.json` (schema: `modules.schema.json`) declares each module's paths, markers, deps, env, compose services, docs and requires/conflicts (`group:db` means "one module of that group").
- **Check.** `pnpm modules:check` validates the schema and paths, checks that regions are balanced and name known modules, and flags orphan markers (a marker in a file not listed in `markers[]`). It also catches `requires` cycles and an invalid default selection, and reports `file:line` on errors. lint-staged runs it when `modules.json` or a marked file is staged.
- **Apply.** `pnpm modules:apply --db=<mongo|postgres> [--without=auth] [--dry-run]` deletes the paths of removed modules, strips their regions and drops the marker lines of kept ones. It prunes deps, scripts and exports from each `package.json` and rewrites `modules.json` to the selection. It is idempotent. Run `pnpm install` afterwards to update the lockfile. On Postgres, also run `pnpm --filter api db:generate`: generated migrations belong to the module that owns their tables, so this rebuilds the journal for the selection. It is a no-op with auth, and without auth it writes an empty journal so `db:migrate` stays valid. `pnpm modules:matrix [combo]` proves the 4 combos in git worktrees of HEAD (lint, typecheck, test, build, Playwright; Docker for Postgres).
- **Choosing modules.** The `/scaffold` skill interviews, runs `apply` (dry-run first), generates `.env` secrets, runs the gates and writes an ADR. See ADR-0011.
- **One engine per app.** Running both engines at once needs its own ADR. To switch engines by hand, follow the "Switching database engine" section in `apps/api/AGENTS.md`.

### Adding an optional module (checklist; `auth` is the reference)

1. Put the module's own code in its own folders (`apps/api/src/modules/<name>`, web route groups, `packages/contracts/src/<name>`) and list them in `paths`. Per-engine code goes in `<name>/mongo` and `<name>/postgres`, and those folders are also listed under the matching `db-*` module's `paths`.
2. Wrap every touchpoint in a shared file in `@module:<name>` regions: the `app.module.ts` import and wiring, the env fragment in `env.schema.ts`, `.env.example`, compose services, vitest coverage globs, `turbo.json` env, web `proxy.ts` and env schema, and contracts `tsdown.config.ts`. List each file in `markers`.
3. Add the entry to `modules.json`: `kind: "optional"`, `deps` per workspace (`"<ws>:dev"` for devDependencies), `env`, `compose`, `docs`, `requires` (`["group:db"]` if it persists data) and `conflicts`.
4. Run `pnpm modules:check`, then `pnpm modules:apply --db=mongo --without=<name> --dry-run` and read the summary.
5. Commit, then run `pnpm modules:matrix` (all combos must pass, with and without the module).
6. Document the module in the nested `AGENTS.md` files and record the decision in an ADR.

## Key behaviours

- **Config.** Env is validated with Zod at boot. In production, weak or example secrets, a missing required var and `CORS_ORIGIN=*` are all rejected.
- **Errors.** Every error uses the envelope `{ error: { code, message, details?, requestId } }`. Adapters map driver errors to `DbError`s, which map to 404, 409 (with `details.field`), 400 and 503. A driver error never leaks.
- **Observability.**
  - `x-request-id` is validated or generated, then propagated from web to api and echoed back.
  - Logs are JSON lines carrying `requestId` (and `userId` when auth is on), with secrets redacted.
  - `/health/live` checks only the process. `/health/ready` checks the active DB.
- **Data access.**
  - Features depend on the `infra/database/core` ports only.
  - Filters accept whitelisted fields and the operators `eq ne in gt gte lt lte contains`, and `contains` input is escaped.
  - Every adapter must pass the shared repository contract suite.
  - Postgres migrations run only through explicit commands, never on boot.
- **Auth (api).**
  - Passwords use Argon2id.
  - The access token is a JWT valid for 15 minutes, with claims `sub`, `roles` and `sid`.
  - The refresh token is an opaque 256-bit value, stored only as a SHA-256 hash. It rotates on every refresh, sessions expire 7 days after last use with a 30-day absolute limit, and reusing a revoked token revokes the whole family.
  - After repeated failed logins, the account gets a progressive temporary lockout. It is never locked permanently.
  - RBAC has the roles `user` and `admin`. A global guard protects every endpoint, with a `@Public()` opt-out. A seed-admin command creates the first admin.
- **Auth (web BFF).**
  - Tokens live only in a jose-encrypted cookie (httpOnly, Secure, `SameSite=Lax`).
  - `proxy.ts` protects routes and refreshes tokens.
  - Cookie-authenticated mutations check `Origin` and `Sec-Fetch-Site` against CSRF.
- **Web security.** Security headers and a tested CSP: nonces on dynamic routes, and a documented, tested strategy for static routes.
- **Performance.** `perf-budgets.json` sets budgets for first-load JS per route, Lighthouse CI (median of 3 runs) and Docker image size. Each budget comes from a measured baseline.
- **Supply chain.**
  - Dependencies are pinned exactly, and pnpm `minimumReleaseAge` blocks fresh releases.
  - Install scripts are opt-in.
  - CI runs gitleaks, CodeQL, `pnpm audit` and dependency-review.
  - Actions are pinned by SHA and run with least-privilege permissions.

## Commands

```bash
pnpm install
pnpm dev                 # all apps (turbo)
pnpm dev:db              # MongoDB via compose.dev.yaml
docker compose -f compose.dev.yaml up -d --wait postgres   # Postgres (when db-postgres is wired)
pnpm lint | typecheck | test | test:e2e | build
pnpm format              # prettier --write .
pnpm --filter api db:sync-indexes          # Mongo indexes (deploy step)
pnpm --filter api db:generate | db:migrate # Postgres migrations (explicit step)
pnpm --filter @repo/contracts build        # contracts must build before consumers
pnpm modules:check       # validate modules.json + markers (M11)
pnpm test:coverage       # tests with per-workspace coverage thresholds (what CI runs)
node scripts/audit-gate.mjs   # pnpm audit + .security/exceptions.json expiry (CI security gate)
docker compose up -d --build --wait        # prod-like stack (compose.yaml; needs docker/{api,web}.env)
pnpm docker:smoke        # build + run the stack, check health/non-root/leaks/SIGTERM, tear down (M12)
```

## Live verification (real databases in Docker)

Anything that needs a running process or a real DB goes through a one-shot script in `scripts/live-check/`, never a dev server or watcher started by hand.

```bash
bash scripts/live-check/api-health.sh postgres   # or: mongo
bash scripts/live-check/modules-postgres.sh auth # or: no-auth — a tree pruned by modules:apply (HEAD) on real Postgres
bash scripts/live-check/docker-postgres.sh       # docker:smoke on a copy of the working tree pruned to Postgres without auth
```

- Needs Docker running. Uses its own compose project (`lc-<task>`) and spare ports (Postgres 5433, Mongo 27018, API 3915), so unrelated containers and a local Mongo on the default ports are never touched.
- Hard timeout 480 s. It always tears down (containers and volumes removed, temporarily edited marker files reverted) and exits non-zero if a check fails. Logs go to `.tasks/.result/logs/`.
- New checks reuse `scripts/live-check/lib.sh` (`lc_init`, `lc_wait_for`, `lc_start_api`, `lc_res`, `lc_finish`).
- PGlite and mongodb-memory-server stay the unit/e2e default; the live check is the proof against the real engines.

## Rules for agents

1. Read the relevant nested `AGENTS.md` before you edit: `apps/api`, `packages/contracts`, and later `apps/web` and `packages/ui`.
2. **Contract-first.** Define HTTP shapes in `@repo/contracts` and never redefine them in api or web.
3. Features use database ports only. Driver imports (`mongoose`, `drizzle-orm`, `pg`, …) are allowed only inside their own adapter folder, and ESLint enforces this.
4. A module's code in shared files goes only inside its `@module:<name>` regions.
5. Gates:
   - 0 lint warnings and strict typecheck.
   - No `any`.
   - Coverage at or above the thresholds (≥ 85% on `infra/database/**`).
   - One test runner (Vitest).
6. Pin dependencies exactly. Never add a dependency for something a few lines can do.
7. Never log secrets: authorization headers, cookies, passwords and tokens are redacted.
8. Record non-trivial decisions as an ADR in `docs/adr/` (copy `0000-template.md`). ADRs are immutable: supersede an old one, never rewrite it.
9. Commit or push only when the user asks (`opencode.json` denies both by default).

## Workflow

1. Pick the next milestone in `docs/plan.md`. Read `docs/milestones/Mxx-*.md`: its tasks, acceptance criteria (`AC-Mxx.n`), verification and Definition of Done.
2. Implement it, keeping every gate green.
3. Run the milestone's verification commands.
4. Tick the tasks. Set the status in the milestone file **and** in the `docs/plan.md` table.
5. Add a `CHANGELOG.md` entry under a new version, tagged with its category (security, tooling, architecture or base-specific), and bump `package.json#boilerplate.version` when releasing.
6. Commit as `type(scope): summary (Mxx)`, for example `feat(api): add Postgres adapter on Drizzle (M05)`.

## Progress

| #   | Milestone                               | Status      |
| --- | --------------------------------------- | ----------- |
| M00 | Planning docs                           | Done        |
| M01 | Repo skeleton                           | Done        |
| M02 | Contracts                               | Done        |
| M03 | API core                                | Done        |
| M04 | db-core + db-mongo                      | Done        |
| M05 | db-postgres                             | Done        |
| M06 | Auth (api)                              | Done        |
| M07 | packages/ui                             | Done        |
| M08 | Web core                                | Done        |
| M09 | Web auth (BFF)                          | Done        |
| M10 | Playwright                              | Done        |
| M11 | Module system + skills (`modules.json`) | Done        |
| M12 | Docker                                  | Done        |
| M13 | platform-config + CI                    | In progress |
| M14 | Perf budgets                            | Not started |
| M15 | Docs (ARCHITECTURE, RULES, FORKING)     | Not started |
| M16 | v1 acceptance                           | Not started |

Keep this table in sync with `docs/plan.md` §4 when a milestone changes status.

## Forking a new project

1. Clone the base. Don't fork it unless you will contribute back.
2. Delete `.git` and run `git init` with one clean commit.
3. Run `/scaffold`.
4. Customize only env, branding and deploy config.
5. Record the decisions and dependency versions in an ADR.

Pull later base changes selectively, using the `CHANGELOG.md` categories (details in `docs/FORKING.md`).

## Read more

- `docs/prd.md`: requirements (FR and NFR), data model, acceptance criteria.
- `docs/plan.md`: architecture, dependencies, milestone graph.
- `docs/milestones/`: per-milestone tasks and acceptance criteria.
- `docs/adr/`: decision history.
- `CHANGELOG.md`: what changed and when.
