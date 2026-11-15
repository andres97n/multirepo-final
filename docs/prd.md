# PRD — `multirepo-final` boilerplate

Status: **Draft — awaiting approval** · Date: 2026-11-13 · Owner: andres97n

## 1. Objective

A reusable **NestJS + Next.js + TypeScript monorepo boilerplate** that is cloned as the starting point of every future project. It must give each new project, from day one:

- A modular architecture where optional capabilities can be added or removed safely.
- Shared contracts between api and web, so the two sides cannot drift apart.
- Strict quality gates, security defaults, observability and container deployment.
- Documentation built for AI agents to extend the code correctly.

`multirepo-base/` is a **reference only**. It shows what worked and what was missing. No code or structure is copied from it.

## 2. Users

| User                                          | Need                                                                                                                    |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Owner (solo dev)                              | Start a new project in minutes with production-grade defaults; pull later improvements from the base selectively.       |
| AI agents (Claude Code, OpenCode/OMO, others) | Unambiguous rules (AGENTS.md), decision history (ADRs), and a scaffold skill that configures modules deterministically. |

## 3. The eight axes (from the design diagram)

1. Modular architecture
2. Shared contracts
3. Monorepo structure
4. Quality and testing
5. Security and configuration
6. Infrastructure and deployment
7. Observability
8. Documentation for AI (AGENTS.md)

The cross-cutting axis is maintenance: Renovate, tests, lint/typecheck/build and performance budgets all keep dependencies healthy over time.

## 4. Scope

### 4.1 Core (always present)

- **Monorepo:** pnpm 11 workspace, Turborepo, Node 24 LTS, a single TypeScript version, strict mode everywhere.
- **API (NestJS 11, Express 5):**
  - Env validation with Zod.
  - Zod validation pipe and a uniform response/error envelope.
  - Request-id propagation.
  - Pino structured logs with redaction.
  - helmet, a CORS allowlist and rate limiting.
  - `/health/live` and `/health/ready`.
  - OpenAPI generated from the Zod contracts.
- **Web (Next.js 16, App Router, React 19):**
  - Zod-validated server-only env.
  - Server-first data fetching and a server API client that forwards the request id.
  - Error boundaries and a health route.
  - Security headers plus a tested CSP.
- **packages/contracts:** Zod 4 schemas and inferred types. This is the single source of truth for HTTP shapes.
- **packages/ui:** Tailwind v4 design tokens, dark mode and minimal shadcn primitives. Business components stay in `apps/web`.
- **packages/config-typescript, packages/config-eslint:** shared presets for base, nest and next.
- **Database layer:**
  - `db-core`: repository interfaces, pagination, filters and shared errors.
  - An engine adapter, chosen per project (see 4.2).
- **Tooling:**
  - ESLint 9 flat config, Prettier, Husky + lint-staged.
  - Vitest with v8 coverage, Playwright E2E.
  - Docker images built with `turbo prune`, plus compose files.
  - GitHub Actions through reusable workflows, and a thin Renovate config.
- **AI docs:** AGENTS.md (canonical), CLAUDE.md (imports AGENTS.md), README, `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT-RULES.md`, `docs/FORKING.md`, `docs/adr/`, Claude skills (`scaffold`, `adr`) and the OpenCode/OMO config.

### 4.2 Configurable modules

Modules are selected at scaffold time by an agent skill that reads `modules.json`.

| Module                                    | Kind                                                                | Default |
| ----------------------------------------- | ------------------------------------------------------------------- | ------- |
| `db-mongo` (Mongoose)                     | DB engine (pick exactly one)                                        | **Yes** |
| `db-postgres` (Drizzle)                   | DB engine (pick exactly one)                                        | No      |
| `auth` (users, sessions, RBAC, BFF login) | Optional, and the **reference example** for future optional modules | **Yes** |

Rules:

- Each application uses one primary database engine. Mixing two engines requires an ADR.
- The base repository ships every module. Forks prune the ones they don't need.
- Every module declares, in the manifest, its paths, dependencies, env vars, wiring markers, docs, and the modules it requires or conflicts with.

### 4.3 Documented optional integrations (not implemented in v1)

TanStack Query, next-intl, Redis-backed throttling and cache, OpenTelemetry traces and metrics, and API latency smoke tests.

### 4.4 Out of scope for v1

Product-specific features, payments, email, file storage, multi-tenancy, OAuth/social login, i18n, Kubernetes manifests, and any hosting-provider-specific deployment.

## 5. Functional requirements

### FR-1 Module scaffolding

- **FR-1.1** The `scaffold` skill asks which database engine to use and which optional modules to keep, then asks how to configure the mandatory ones (env values, ports, names).
- **FR-1.2** It runs `scripts/modules.mjs apply`. The script is deterministic: it deletes module paths, strips `@module:<name>` marker regions, and updates dependencies, `.env.example` and compose.
- **FR-1.3** It updates the docs and writes an ADR recording the chosen modules and the dependency versions in use.
- **FR-1.4** `pnpm modules:check` validates the manifest: paths exist, markers are balanced, and requires/conflicts are satisfiable.

### FR-2 Auth module (when enabled)

- **FR-2.1** Login with email and password. Passwords are hashed with Argon2id.
- **FR-2.2** The access token is a JWT that lasts 15 minutes, with claims `sub`, `roles` and `sid`.
- **FR-2.3** The refresh token is opaque, 256 bits, and stored only as a SHA-256 hash. It is rotated on every refresh. Sessions expire 7 days after last use, with an absolute limit of 30 days per family.
- **FR-2.4** Reuse detection: if a revoked refresh token is presented, the whole session family is revoked.
- **FR-2.5** Logout revokes the current session. Multiple concurrent sessions per user are supported.
- **FR-2.6** Login protection:
  - Per-IP throttling on `/auth/login`.
  - Per-account progressive temporary lockout: 5 failures, then a 60 s base lock that doubles up to a 15 min cap.
  - Never a permanent automatic lock.
  - Generic error messages.
- **FR-2.7** RBAC: roles `user` and `admin`. Endpoints are protected by default through a global guard, with a `@Public()` opt-out. The guard exists only when the auth module is installed.
- **FR-2.8** The web app is a BFF:
  - Tokens live in a jose-encrypted httpOnly, Secure, `SameSite=Lax` cookie, so the browser never sees a JWT.
  - `proxy.ts` protects routes and refreshes tokens.
  - Every cookie-authenticated mutating route handler checks `Origin`/`Sec-Fetch-Site` against CSRF.
- **FR-2.9** A seed-admin command creates the first admin from env or CLI input.
- **FR-2.10** The login form validates against the same contract schemas the api uses.

### FR-3 Data access

- **FR-3.1** Feature modules depend only on `db-core` ports. Driver code lives only in adapters.
- **FR-3.2** Adapters map driver errors to shared `DbError`s (NotFound, Conflict, …). The filter maps those to HTTP envelopes.
- **FR-3.3** A shared repository contract test suite runs against every adapter: Mongo on mongodb-memory-server, Postgres on PGlite.
- **FR-3.4** Postgres migrations use drizzle-kit and run as an explicit step, never on boot.

### FR-4 Health and observability

- **FR-4.1** `/health/live` checks only the process. `/health/ready` checks the active DB adapter.
- **FR-4.2** Every log line is JSON and carries `requestId` (plus `userId` when auth is on). Authorization headers, cookies, passwords and tokens are redacted.
- **FR-4.3** `x-request-id` is accepted (when validated) or generated, then propagated from the web BFF to the api and echoed in error envelopes.

## 6. Non-functional requirements

### Security

- **NFR-SEC-1** Env is validated at boot. Weak secrets, `CORS_ORIGIN=*` and missing required vars are rejected in production.
- **NFR-SEC-2** helmet runs on the api. Web gets security headers (HSTS, Permissions-Policy, Referrer-Policy, frame-ancestors).
- **NFR-SEC-3** Web has a **tested CSP**:
  - Dynamic routes use nonces.
  - Static routes are not forced dynamic; their strategy is documented and tested.
- **NFR-SEC-4** Supply chain (CI): gitleaks, CodeQL, `pnpm audit`, dependency-review, pnpm `minimumReleaseAge`.
- **NFR-SEC-5** Actions are pinned by SHA and run with least-privilege `permissions`.
- **NFR-SEC-6** Blocking severities and the exception process are documented in `SECURITY.md`.
- **NFR-SEC-7** Every control has tests. Parameters can be tuned per project (env/config), but the default protections cannot be disabled.

### Quality

- **NFR-QUAL-1** Zero lint warnings and strict typecheck in every workspace.
- **NFR-QUAL-2** Coverage thresholds are set from a measured baseline and enforced.
- **NFR-QUAL-3** Pre-commit runs lint-staged.
- **NFR-QUAL-4** One test runner (Vitest) and one TypeScript version across the repo.

### Performance budgets

- **NFR-PERF-1** First-load client JS per representative route, measured on the production build.
- **NFR-PERF-2** Lighthouse CI: median of 3 runs, starting as warnings and promoted to blocking once calibrated.
- **NFR-PERF-3** Docker image size budget.
- **NFR-PERF-4** Baselines are measured before budgets are set. Budgets live in `perf-budgets.json`, configurable per child project without disabling the checks.

### Deployability

- **NFR-DEP-1** Multi-stage `turbo prune` images, non-root, with HEALTHCHECK.
- **NFR-DEP-2** Compose files for dev and prod-like runs.

### Maintainability

- **NFR-MAINT-1** Renovate presets live in the central `platform-config` repo; children extend them with a thin `renovate.json`.
- **NFR-MAINT-2** Reusable CI workflows are pinned by tag/SHA.
- **NFR-MAINT-3** Decisions are recorded as immutable ADRs in `docs/adr/`.

### DX

- **NFR-DX-1** After `clone → pnpm i → pnpm dev`, the stack runs with only `.env` values copied from `.env.example`.
- **NFR-DX-2** AI agents can extend the repo using only AGENTS.md, the docs and the skills.

## 7. Data model

### Shared contracts (Zod)

- `SuccessEnvelope<T>`: `{ data: T, meta?: object }`
- `ErrorEnvelope`: `{ error: { code, message, details?, requestId } }`
- `PageQuery`: `{ page ≥ 1, limit 1..100, sort? }`
- `Paginated<T>`: `{ items: T[], page, limit, total }`
- `FilterSpec`: a whitelisted field / operator / value list
- `Health`: `{ status, checks }`
- Auth: `LoginInput`, `MeResponse`, `Role = 'user' | 'admin'`, password policy

### User

| Field                 | Type                   | Notes                           |
| --------------------- | ---------------------- | ------------------------------- |
| id                    | string                 | Mongo ObjectId hex / PG uuid v7 |
| email                 | string                 | unique, lowercased              |
| passwordHash          | string                 | argon2id                        |
| roles                 | Role[]                 | default `['user']`              |
| status                | `active` \| `disabled` |                                 |
| failedLoginCount      | int                    | reset on success                |
| lockedUntil           | datetime?              | progressive lock                |
| createdAt / updatedAt | datetime               |                                 |

### Session (refresh token)

| Field           | Type      | Notes                   |
| --------------- | --------- | ----------------------- |
| id              | string    | becomes the `sid` claim |
| userId          | string    | FK / ref                |
| familyId        | string    | rotation chain          |
| tokenHash       | string    | sha256, unique          |
| expiresAt       | datetime  | sliding 7 d             |
| familyExpiresAt | datetime  | absolute 30 d           |
| revokedAt       | datetime? |                         |
| replacedBy      | string?   | next session id         |
| ip, userAgent   | string    | audit                   |
| createdAt       | datetime  |                         |

## 8. Fork and migration model (from the diagram)

- **New project:**
  1. Clone the base (don't fork unless you will contribute back).
  2. Delete `.git` and `git init` with one clean commit.
  3. Run `/scaffold`.
  4. Customize only env, branding and deploy config.
  5. Record the decisions and dependency versions in an ADR.
- **Updating a child from the base:** use selective merge or a manual re-scaffold. Changes from the base fall into four categories:

| Category                           | Propagate?                                     |
| ---------------------------------- | ---------------------------------------------- |
| Security and critical dependencies | Almost always                                  |
| Tooling (ESLint, TS, Turbo)        | Yes, if it doesn't break the child's structure |
| Architecture changes               | Only if needed                                 |
| Base-specific features             | Never                                          |

`CHANGELOG.md` tags each entry with its category, and `package.json#boilerplate.version` tracks which base version a child is on.

- The base stays generic. A change that only applies to one kind of project goes to that project, not to the base.

## 9. Acceptance criteria (v1 done)

1. **Fresh clone green.**
   - `clone → pnpm i → pnpm dev` works.
   - `pnpm lint typecheck test build` pass with zero warnings, locally and in CI.
2. **Module matrix green.** CI applies `scripts/modules.mjs` for {mongo, mongo+auth, postgres, postgres+auth}, and every combination passes lint, typecheck, unit + e2e tests, build and Playwright smoke.
3. **Scaffold round-trip.**
   - From a fresh clone, an agent using the `scaffold` skill can remove auth and swap mongo to postgres.
   - The result passes all gates, `modules:check` passes, the docs are updated, and an ADR is written.
4. **Docker CI-verified.**
   - CI builds the api and web images via `turbo prune`.
   - Containers run as non-root, `compose up` health checks pass, and the image-size budget is enforced.
5. **Security controls tested.**
   - Tests exist for lockout, refresh reuse detection, CSRF rejection, CSP header presence/shape and env rejection.
   - The CI security jobs run with the documented blocking levels.
6. **Docs complete.** AGENTS.md, CLAUDE.md, README, ARCHITECTURE, DEVELOPMENT-RULES, FORKING and SECURITY exist, along with ADRs for every locked decision.

## 10. Open questions / assumptions

- `eslint-plugin-prettier` from the diagram is replaced by `eslint-config-prettier` + a separate Prettier run (faster, and what Prettier recommends). Revert if preferred.
- The central repo is named `andres97n/platform-config` (Renovate presets + reusable workflows). The name can be changed.
- All dependency versions are pinned exactly at implementation time, using the latest stable releases that satisfy `minimumReleaseAge`.
