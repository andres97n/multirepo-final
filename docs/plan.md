# Development Plan — `multirepo-final`

Status: **Draft — awaiting approval** · Date: 2026-11-13 · Requirements: [prd.md](./prd.md)

Each milestone is small and leaves the repo **green**: lint, typecheck, test and build all pass. Each task has a "done when" check. No milestone starts until the previous one is green and committed.

## 1. Architecture overview

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

   packages/contracts (Zod) ── imported by api (validation + OpenAPI) and web (forms + types)
   packages/ui        (Tailwind v4 tokens + shadcn primitives) ── imported by web
```

### Principles

- **Contract-first:** a change to an HTTP shape starts in `packages/contracts`, and the type errors it causes guide the rest of the change.
- **Ports and adapters only where they pay off:** the database layer. Elsewhere, Nest modules talk to each other directly.
- **Modules are removable:** each optional module touches shared files only inside `// @module:<name>` … `// @end-module:<name>` marker regions.
- **Secure by default, tunable per project:** controls take parameters from validated env. Defaults cannot be turned off.

## 2. Folder structure

```
multirepo-final/
├─ apps/
│  ├─ api/
│  │  ├─ src/
│  │  │  ├─ main.ts · app.module.ts
│  │  │  ├─ config/           env.schema.ts (Zod; per-module fragments merged)
│  │  │  ├─ common/           envelope filter, request-id middleware, zod pipe, pagination helpers
│  │  │  ├─ infra/
│  │  │  │  ├─ logger/        nestjs-pino setup + redaction
│  │  │  │  ├─ health/        live + ready
│  │  │  │  └─ database/
│  │  │  │     ├─ core/       ports, DbError, pagination/filter types, repository contract test suite
│  │  │  │     ├─ mongo/      @module:db-mongo
│  │  │  │     └─ postgres/   @module:db-postgres (schema/, migrations/, drizzle.config.ts)
│  │  │  └─ modules/
│  │  │     └─ auth/          @module:auth (users/, sessions/, guards/, mongo/, postgres/)
│  │  ├─ test/                e2e (vitest + supertest)
│  │  ├─ Dockerfile · vitest.config.ts · AGENTS.md
│  └─ web/
│     ├─ src/
│     │  ├─ app/              (public)/ · (auth)/login · (app)/dashboard · api/{health,auth/*}
│     │  ├─ proxy.ts
│     │  ├─ lib/              env.ts · api-client.server.ts · session.ts · csrf.ts · csp.ts
│     │  └─ components/
│     ├─ e2e/                 Playwright specs (auth / no-auth projects)
│     ├─ Dockerfile · playwright.config.ts · vitest.config.ts · AGENTS.md
├─ packages/
│  ├─ contracts/              src/{http,errors,pagination,filters,health,auth}/ · tsdown.config.ts
│  ├─ ui/                     src/{tokens.css,components/*} · components.json
│  ├─ config-typescript/      base.json · nest.json · next.json · library.json
│  └─ config-eslint/          base.js · nest.js · next.js
├─ scripts/modules.mjs
├─ modules.json
├─ perf-budgets.json · lighthouserc.json
├─ compose.yaml · compose.dev.yaml · .env.example (per app)
├─ .github/workflows/ci.yml   (calls platform-config reusable workflows)
├─ renovate.json
├─ .claude/skills/{scaffold,adr}/SKILL.md · .claude/settings.json
├─ .opencode/ (OMO config → AGENTS.md + .claude/skills)
├─ .husky/pre-commit · lint-staged.config.mjs · prettier.config.mjs · .editorconfig · .nvmrc · .npmrc
├─ AGENTS.md · CLAUDE.md · README.md · SECURITY.md · CHANGELOG.md · LICENSE
└─ docs/ prd.md · plan.md · ARCHITECTURE.md · DEVELOPMENT-RULES.md · FORKING.md · adr/0000-template.md …

platform-config/  (sibling folder → separate GitHub repo andres97n/platform-config)
├─ default.json               Renovate preset
└─ .github/workflows/{quality,security,docker,perf,e2e}.yml   (workflow_call)
```

## 3. Dependencies

All versions are pinned exactly, using the latest stable release that satisfies `minimumReleaseAge`. They are verified when M1 starts.

| Where                  | Packages                                                                                                                                                                                                                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root (dev)             | turbo, typescript, prettier, eslint 9, typescript-eslint, eslint-config-prettier, husky, lint-staged, vitest, @vitest/coverage-v8                                                                                                                                                              |
| packages/contracts     | zod 4 · dev: tsdown                                                                                                                                                                                                                                                                            |
| packages/config-eslint | @eslint/js, typescript-eslint, eslint-config-prettier, @next/eslint-plugin-next, eslint-plugin-react-hooks                                                                                                                                                                                     |
| packages/ui            | tailwindcss 4, radix-ui, class-variance-authority, tailwind-merge, lucide-react                                                                                                                                                                                                                |
| apps/api               | @nestjs/{core,common,platform-express,config,swagger,terminus,throttler,jwt}, nestjs-zod, zod, nestjs-pino, pino-http, helmet, argon2 · adapters: mongoose / drizzle-orm + pg · dev: unplugin-swc, @swc/core, supertest, mongodb-memory-server, @electric-sql/pglite, drizzle-kit, pino-pretty |
| apps/web               | next, react, react-dom, zod, jose · dev: @playwright/test, @testing-library/react, jsdom, @lhci/cli, size-limit                                                                                                                                                                                |

Deliberately excluded:

- **class-validator / class-transformer**: Zod replaces both.
- **passport**: guards built on @nestjs/jwt are enough.
- **bcrypt**: Argon2id is used instead.
- **eslint-plugin-prettier**: Prettier runs separately.
- **TanStack Query and next-intl**: documented as optional integrations.

## 4. Milestones

Each milestone has its own file in [`milestones/`](./milestones/). The file holds the tasks, deliverables, numbered acceptance criteria (`AC-Mxx.n`), verification commands, ADRs, risks and the Definition of Done.

| #   | Milestone                                                      | Depends on    | Status      | Goal                                                                              |
| --- | -------------------------------------------------------------- | ------------- | ----------- | --------------------------------------------------------------------------------- |
| M00 | [Planning docs](./milestones/M00-planning-docs.md)             | —             | Done        | PRD, plan and milestone files approved                                            |
| M01 | [Repo skeleton](./milestones/M01-repo-skeleton.md)             | M00           | Done        | Empty, fully gated pnpm + Turbo workspace                                         |
| M02 | [Contracts](./milestones/M02-contracts.md)                     | M01           | Done        | Zod schemas as the single source of truth for HTTP shapes                         |
| M03 | [API core](./milestones/M03-api-core.md)                       | M02           | Done        | Nest app with config, validation, errors, request-id, logs, security, health/live |
| M04 | [db-core + db-mongo](./milestones/M04-db-core-mongo.md)        | M03           | Done        | DB ports + Mongo adapter passing the repository contract suite                    |
| M05 | [db-postgres](./milestones/M05-db-postgres.md)                 | M04           | In review   | Drizzle adapter passing the same contract suite                                   |
| M06 | [Auth (api)](./milestones/M06-auth-api.md)                     | M04, M05      | Done        | JWT + rotating refresh families, Argon2id, lockout, RBAC, on both engines         |
| M07 | [packages/ui](./milestones/M07-ui-package.md)                  | M01           | Not started | Tailwind v4 tokens + accessible shadcn primitives                                 |
| M08 | [Web core](./milestones/M08-web-core.md)                       | M03, M07      | Not started | Next app with env, typed api client, errors, headers and CSP                      |
| M09 | [Web auth (BFF)](./milestones/M09-web-auth.md)                 | M06, M08      | Not started | Encrypted cookie session, proxy protection/refresh, CSRF                          |
| M10 | [Playwright](./milestones/M10-playwright.md)                   | M09           | Not started | Prod-build browser smoke, auth / no-auth projects                                 |
| M11 | [Module system + skills](./milestones/M11-module-system.md)    | M06, M09, M10 | Not started | `modules.json`, prune script, scaffold + adr skills, OpenCode config              |
| M12 | [Docker](./milestones/M12-docker.md)                           | M11           | Not started | turbo-prune images, non-root, compose dev + prod-like                             |
| M13 | [platform-config + CI](./milestones/M13-platform-config-ci.md) | M11, M12      | Not started | Central Renovate presets + reusable workflows, module matrix                      |
| M14 | [Perf budgets](./milestones/M14-perf-budgets.md)               | M12, M13      | Not started | Baseline, per-route JS, LHCI, image size budgets                                  |
| M15 | [Docs](./milestones/M15-docs.md)                               | M01–M14       | Not started | Docs complete enough for an agent to work from them alone                         |
| M16 | [v1 acceptance](./milestones/M16-acceptance.md)                | M00–M15       | Not started | Prove PRD §9 from a clean state; tag v1.0.0                                       |

### Dependency graph

```
M00 → M01 ─┬→ M02 → M03 ─┬→ M04 → M05 → M06 ─┐
           │             │                    ├→ M09 → M10 → M11 → M12 → M13 → M14 → M15 → M16
           └→ M07 ───────┴→ M08 ──────────────┘
```

- M07 can run in parallel with M02–M06.
- Docs grow in every milestone; M15 finalizes them.
- ADR numbering follows milestone order (0001 in M01 … 0013 in M14).

## 5. Milestone file template

New or future milestones use this structure:

```markdown
# Mxx — Title

| Field      | Value                            |
| ---------- | -------------------------------- |
| Status     | Not started / In progress / Done |
| Depends on | links                            |
| PRD refs   | FR-x.y, NFR-AREA-n               |
| Axes       | 1–8                              |

## Goal

## Scope

## Out of scope

## Tasks (checklist)

## Deliverables (paths)

## Acceptance criteria

### Functional / Security / Quality / Module-awareness / Docs (AC-Mxx.n, each testable)

## Verification (exact commands)

## ADRs produced

## Risks & mitigations

## Definition of Done
```

Rules:

- Each AC must be checkable by a command, a test or a concrete observation.
- When a milestone is done, set its status here and in its file in the same commit.
- If implementation changes a decision, update the milestone file and write an ADR.

## 6. Risks and mitigations

| Risk                                                            | Mitigation                                                                                                                   |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| TS 6 not yet supported by Next / typescript-eslint / nestjs-zod | Verify in M1; otherwise pin the newest compatible TS repo-wide and record the reason in an ADR.                              |
| nestjs-zod ↔ @nestjs/swagger ↔ Zod 4 version coupling           | Spike in M3 before building on it; the fallback is `zod-openapi` generation.                                                 |
| A Next CSP with nonces forces dynamic rendering                 | Mixed strategy plus header tests on static and dynamic routes (M8); ADR.                                                     |
| Vitest + Nest decorator metadata                                | unplugin-swc with `decoratorMetadata`; smoke test in M3.                                                                     |
| mongodb-memory-server binary download in CI                     | Cache the binary dir; pin the Mongo version.                                                                                 |
| Marker-based pruning rots                                       | `modules:check` in pre-commit and CI, plus the matrix job.                                                                   |
| platform-config must exist before CI can run                    | Explicit bootstrap order in M13; local `act`/manual run until it is published.                                               |
| In-memory throttling and lockout counters are per instance      | Lockout state is in the DB (shared); IP throttling is per instance. `ponytail:` note: Redis store when scaling horizontally. |
| OpenCode doesn't discover `.claude/skills`                      | Verify in M11; symlink or configure `skills` paths in the OMO config.                                                        |
| Scope creep into product features                               | The PRD's out-of-scope list; the "base stays generic" rule in AGENTS.md.                                                     |
