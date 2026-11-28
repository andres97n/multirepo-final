# Changelog

All notable changes to this project are documented here. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [Semantic Versioning](https://semver.org/).

## [0.12.0] - 2026-11-28

### Fixed

- **11:43 — `2fb0bcb` fix(api): provision Postgres for api e2e (M13)** — found by the first CI run of the matrix.
- **11:43 — `4ebacc0` fix(api): keep helmet's Content-Security-Policy enabled (M13)**

### Added

- **ci(repo): CI on the central `platform-config` workflows (M13, tooling)** — `.github/workflows/ci.yml` calls the reusable `quality`, `e2e`, `security` and `docker` workflows of [`andres97n/platform-config`](https://github.com/andres97n/platform-config), pinned by commit SHA (ADR-0013).
  - **Triggers:** PRs and pushes to `develop`/`main`, nightly, manual dispatch.
  - **Default selection:** mongo+auth runs on every change.
  - **Other combos:** mongo, postgres and postgres+auth run when `scripts/ci-changes.mjs` sees a module-system change, nightly, or on dispatch.
  - **Required check:** `ci-ok` aggregates every job and is the only check branch protection needs.
- **`scripts/ci-prepare.mjs [combo]`:** frozen install, or apply a combo, re-resolve the lockfile and regenerate Postgres migrations. It then writes env files with random secrets. `scripts/combos.mjs` now holds the combos and the env writer shared with `modules:matrix`.
- **`pnpm test:coverage`:** new Turbo task. CI enforces the per-workspace coverage thresholds.
- **api e2e on Postgres:** `test/global-setup-postgres.ts` starts and migrates a Postgres container, so `pnpm test:e2e` on that selection needs Docker.
- **`renovate.json`:** extends `github>andres97n/platform-config#v1`.
- **`docs/FORKING.md` (draft):** how a child pins and upgrades platform-config, and the branch protection to set.

### Security

- **ci(repo): blocking security checks in CI (M13)** — gitleaks on the full history, CodeQL (error level), `scripts/audit-gate.mjs`, dependency-review and Trivy (CRITICAL). Levels are in `SECURITY.md`.
- **api:** helmet's default Content-Security-Policy is now enabled (it was off; CodeQL `js/insecure-helmet-configuration`).
- **Exceptions:** moved to `.security/exceptions.json`, each with an expiry date. `audit-gate.mjs` fails on an expired entry of any tool and on high/critical production advisories without a live exception. EXC-2026-1 is migrated.
- **`.gitleaks.toml`:** keeps the default rules and allowlists test-fixture paths only, where the dummy secrets are deliberate.

## [0.11.1] - 2026-11-25

### Security

- **10:49 — `9e89719` fix(docker): DB credentials and Mongo auth in compose (M12)**
  - `compose.yaml` no longer contains database passwords. Mongo and Postgres read them from gitignored `docker/mongo.env` and `docker/postgres.env`; the templates are owned by the `db-*` modules.
  - Mongo runs with authentication. The api connects as a `readWrite`-only `app` user, created by `docker/mongo/init/01-app-user.js`.
  - The Postgres app role password comes from `APP_DB_PASSWORD` (`01-app-role.sh`). Dev keeps `app` in `compose.dev.yaml`.
  - `docker:smoke` generates the credentials and checks that unauthenticated or default-password access is refused (`DB_AUTH`).
- **10:49, 10:58 — `84cfb28`, `b2e8da0` fix(api): the migrator redacts credentials in error output** — `scheme://user:pass@` becomes `scheme://[REDACTED]@`, including passwords with an unencoded `/` or `@`.
- **11:02 — `770628b` fix(api): scheme-less authorities and the known password are masked too** — `//user:pass@host` is masked again (a regression in `b2e8da0`), and the password parsed from `DATABASE_URL` is replaced, raw and URL-decoded, wherever it appears.

### Added

- **10:49 — `800a0fb` docs: `SECURITY.md`** — how to report, supported versions, secure defaults, blocking severities and the exception table (EXC-2026-1: Debian OS HIGHs, per ADR-0012). README and `apps/api/AGENTS.md` document the database env files. M13 notes that its ADR becomes 0013.

## [0.11.0] - 2026-11-25

### Added

- **10:16 — `c820ea9` docs: ADR-0012 and Docker docs (M12)** — README "Run with Docker", Dockerfile stages in `apps/api/AGENTS.md` and `apps/web/AGENTS.md`, and the `docker:smoke` command in `AGENTS.md`. M12 is done.
- **10:15 — `822877f` test(repo): docker smoke and Postgres docker live check (M12, tooling)**
  - `pnpm docker:smoke` builds and starts the stack on ports 3916/3917 with throwaway secrets. It checks api and web health, web → api over the compose network, a static asset, a non-root uid, no leaked `.env`/source/`.git`/devDeps/package managers, and SIGTERM (stop < 10 s, shutdown logged). It always tears down.
  - `bash scripts/live-check/docker-postgres.sh` runs the same smoke on a copy of the working tree pruned to Postgres without auth. Migrations run first.
  - `perf-budgets.json` (draft) holds the image-size baseline: api 452 MB / web 392 MB (318 / 261 MB on disk).
- **10:15 — `1d214e7` feat(api): in-image Postgres migrator and shutdown log (M12, base-specific)**
  - `node dist/infra/database/postgres/migrate.js` applies the Drizzle journal with the runtime `drizzle-orm` migrator. It is an explicit deploy step, never run on boot.
  - The api logs `shutting down (<signal>)` once its DB connections are closed.
- **10:15 — `77003d8` build(docker): turbo-prune images and prod-like compose stack (M12, architecture)**
  - `apps/{api,web}/Dockerfile` use pruner → deps → build → runtime stages on `node:24-trixie-slim` pinned by digest. They run as non-root, health-check with node `fetch`, and ship no package manager at runtime.
  - The api runtime is `pnpm deploy --prod` output (`files`: `dist`, `migrations`). The web runtime is Next `standalone`.
  - `compose.yaml` (project `app-stack`): api, web and the selected DB in `@module:db-*` regions, healthchecks with `service_healthy`, secrets from gitignored `docker/{api,web}.env` (templates `docker/*.env.example`), and `init`, read-only root fs, `no-new-privileges`, `restart: unless-stopped`.

### Security

- Trivy reports 0 CRITICAL in both runtime images. The bookworm base carried CRITICAL zlib1g CVE-2023-45853, hence trixie. The remaining 51 HIGH are Debian OS packages (50 without an upstream fix), accepted in ADR-0012 until the next base digest bump.

## [0.10.0] - 2026-11-24

### Added

- **21:33 — `2801236` test(repo): live check for pruned Postgres trees (M11, tooling)** — `bash scripts/live-check/modules-postgres.sh <auth|no-auth>` applies the selection in a worktree of HEAD and checks it on Postgres 17: pruned compose, non-superuser role, idempotent migrations with no schema drift, boot, seed-admin + login + `/auth/me` (or 404 without auth), health down/up.

- **21:18 — `90666bb` feat(repo): module manifest and pruning script (M11, architecture)**
  - `modules.json` + `modules.schema.json` describe `db-mongo`, `db-postgres` and `auth`: paths, markers, deps, env, compose, requires/conflicts.
  - `pnpm modules:check` validates the schema, paths and marker balance and flags orphan markers, `requires` cycles and invalid default selections (`file:line` errors). lint-staged runs it when a marked file is staged.
  - `pnpm modules:apply --db=<mongo|postgres> [--without=auth] [--dry-run]` deletes paths, strips regions (also JSX `{/* @module */}`), uncomments the chosen non-default engine, prunes `package.json` deps, scripts and exports, and rewrites the manifest. Idempotent; stdlib only.
  - `pnpm modules:matrix [combo]` runs the 4 combos in git worktrees through every gate and Playwright.
- **21:18 — `ae3cfb5` feat(agents): `scaffold` and `adr` skills (M11, tooling)** — the interview, apply, `.env` secrets written without printing them, gates and ADR; the next-number ADR with two-way supersede links. OpenCode discovers both natively.
- **21:18 — `1365f6d`, `bb40658` docs: ADR-0011 and the AGENTS.md Modules section** (marker convention, inactive engine, add-a-module checklist); M11 is done.

### Changed

- **21:18 — `f98387c` build(repo): `lint` and `typecheck` depend on `^build` (tooling)** — a fresh clone failed type-aware lint before `@repo/contracts` was built.
- The M04 `db-mongo.markers.spec.ts` is removed; `modules:check` covers every module.

### Fixed

- **21:33 — `ab85a78` fix(repo): the auth migration is pruned with auth (M11)** — a Postgres tree without auth still created `users`/`sessions`, and `db:generate` wanted to drop them. Postgres trees now run `pnpm --filter api db:generate` after install (a no-op with auth; without auth it writes an empty journal).
- **21:18 — `90ff1af`, `1eb4ea1`, `91c2c96` fix(repo): pruned trees stay green** — JSX marker regions, `e2e-server.mjs` imports per engine, `proxy.ts` stays valid without auth, the Mongo-only env spec is marked, and the matrix writes local env files.

## [0.9.0] - 2026-11-24

### Added

- **19:19 — `89938a4` test(web): E2E on Postgres and steadier CSP checks (M10, tooling)**
  - `e2e-server.mjs` reads the engine from `app.module.ts`: MongoDB in memory, or Postgres in Docker (compose project `e2e`, migrated with `db:migrate`, removed by a global teardown).
  - The violations fixture waits for browser idle before asserting; the root scripts install Chromium when missing.
- **19:07 — `ef2a8cf` test(web): Playwright E2E smoke suite (M10, tooling)**
  - `pnpm test:e2e:web` runs against the production build of web and a running api, with an `auth` or `no-auth` project picked from the installed modules.
  - CSP violations and uncaught page errors fail any test; `eslint-plugin-playwright` blocks focused and skipped tests.

### Fixed

- **19:19 — `95e780e` fix(web): login submit is disabled until hydrated** — a click before hydration posted the form natively to the JSON-only handler and showed a raw 400. E2E waits on the button instead of `networkidle`.
- **19:07 — `b8bcf69` fix(web): CSP violations found by the browser suite (security)**
  - `/login` no longer triggers a `script-src eval` report from Zod.
  - Unknown URLs render a dynamic `global-not-found.tsx`, so their scripts carry the nonce instead of being blocked (ADR-0010).

## [0.8.0] - 2026-11-24

- **18:42 — `292c637` chore:** ignore the generated `next-env.d.ts` and `*.tsbuildinfo` files.

### Added

- **18:40 — `819272c`, `68a52ee` feat(web): auth Backend-for-Frontend (M09), inside `@module:auth`**
  - Encrypted session cookie (jose `dir` + `A256GCM`), with `SESSION_SECRET_PREVIOUS` for key rotation.
  - `/api/auth/login` and `/api/auth/logout`, the `/login` and `/dashboard` pages and a logout button.
  - `proxy.ts` protects `/dashboard` and refreshes the access token in place.
  - Env: `APP_ORIGIN`, `SESSION_SECRET`, `SESSION_SECRET_PREVIOUS`, `SESSION_MAX_AGE_SECONDS`, `SESSION_REFRESH_SKEW_SECONDS`.
  - ADR-0009 and the "Auth (BFF)" section of `apps/web/AGENTS.md`.

### Changed

- `apiGet` / `apiPost` accept a `token` option (Bearer).
- `APP_ORIGIN` and `SESSION_SECRET` are now required by `next build`; `turbo.json` passes the web env to `build`.

### Fixed

- `b6f4f66`: `seed:admin` always failed against a real database. The adapters implement the `UsersRepository` port without extending it, so its `instanceof` check never passed.

### Security

- CSRF origin checks on every mutating route handler, safe `next` redirects, and example session secrets rejected in production.

## [0.7.0] - 2026-11-23

### Added

- **23:05 — `36ada97`, `e23da7d` feat(web): add `apps/web` Next.js 16 core (M08)**
  - Validated server-only env (`env.schema.ts` + `server-only` `env.ts`): invalid or missing variables fail `next build` and boot naming the variable; no `NEXT_PUBLIC_*`.
  - `api-client.server.ts`: `apiGet`/`apiPost` on contract schemas, `ErrorEnvelope` mapped to typed `ApiError`, `ApiTimeoutError`, `x-request-id` forwarded or generated.
  - Home page (RSC api health), `error.tsx` / `global-error.tsx` / `not-found.tsx` showing the `requestId` and never the stack, `/api/health` with `?deep=1`.
  - Security: headers on static and dynamic routes; `proxy.ts` per-request CSP nonce with `strict-dynamic` on dynamic routes; nonce-less CSP on static routes so they stay static; no `unsafe-eval` in production; client-bundle leak check.
  - Vitest (node + jsdom): 64 tests, ~99% line coverage on `lib/`. Live check against a mock api.
  - ADR-0008 and `apps/web/AGENTS.md`.
  - Review fixes: readiness 503 `Health` body renders the health card instead of `error.tsx`; `CSP_REPORT_URI` is wired to both CSP paths and emits only `report-uri`; the static CSP allows `unsafe-eval` under `next dev` only.

### Security

- Static routes use `script-src 'self' 'unsafe-inline'` because Next emits inline scripts without hashes (documented in ADR-0008).

## [0.6.0] - 2026-11-23

### Added

- **20:14 — `f8a600f`, `d087bf8` feat(ui): add `@repo/ui` shared UI package (M07)**
  - Source-only package: `@repo/ui/tokens.css`, `@repo/ui/components/*`, `@repo/ui/lib/cn`; React 19 as peer dependency, no Next.js dependency.
  - Tailwind v4 tokens (`@theme inline`) with light and dark themes: `prefers-color-scheme` by default, `data-theme="light|dark"` override, CSS-only so there is no flash on load.
  - Primitives: Button (cva variants and sizes), Input, Label, Card, FormField (`aria-invalid` / `aria-describedby` wiring), Toaster (sonner, colors bound to the tokens so it follows both `prefers-color-scheme` and `data-theme`); `cn()` helper; `components.json` for the shadcn CLI.
  - Tests: Vitest + Testing Library + jsdom, a vitest-axe check per component, WCAG AA contrast tests computed from the tokens, and a real Tailwind compile test proving `@source` generates the package utilities. 41 tests, 100% line coverage.
  - ADR-0007 and `packages/ui/AGENTS.md` (boundary rule: only generic, unbranded primitives live here).

### Changed

- `pnpm-workspace.yaml`: `esbuild` added to `allowBuilds` (needed by the Vitest/Tailwind tooling install).
- `d12a420` Tooling: `scripts/live-check/` (`lib.sh`, `api-health.sh <mongo|postgres>`) runs one-shot checks against real databases in Docker with a private compose project, spare ports, a hard timeout and guaranteed teardown, so agents can verify against real engines without starting servers by hand. Verified end to end, including an unattended OpenCode run.
- `ef40d11` M05 closed: live checks ran against a real Postgres 17 in Docker (compose project, spare port): non-superuser `app` role, `db:migrate` twice is a no-op and `db:generate` finds no changes, engine swap touched only the `@module:db-*` regions of three files, API boots, `/health/ready` is 200 up, 503 down and recovers while `/health/live` stays 200.

## [0.5.0] - 2026-11-22

### Added

- **22:30 — `0a188c0`, `5a51f24`, `d80f143`, `2628f2f`, `bc593d2` feat(api): add auth module (M06)**
  - `modules/auth` (`@module:auth`): Argon2id passwords, HS256 access JWT (`sub`, `roles`, `sid`, `iss`/`aud` checked), rotating refresh sessions in families with reuse detection and a bounded grace window, progressive lockout, global `JwtAuthGuard` + `RolesGuard`, `@Public()` / `@Roles()`.
  - Endpoints: `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `GET /auth/me`, admin `GET /users` (paginated + filtered).
  - Users/sessions ports with Mongo and Postgres adapters (+ first Postgres migration) sharing one contract suite; per-IP `login` throttler; `seed:admin` command; expired-session cleanup interval.
  - Contracts: `TokenPair`, `RefreshInput`, `UserStatus`, `UserListItem`, `UsersQuery`, `UsersPage`.
  - E2E auth suite on Mongo and on Postgres (PGlite); ADR-0006; "Auth module" section in `apps/api/AGENTS.md`.

### Security

- Refresh rotation is an atomic compare-and-swap on the presented token and every retired hash is remembered, so concurrent refreshes cannot both succeed and old-token replays always revoke the family.
- Passwords stored only as argon2id hashes; refresh tokens only as SHA-256 hex; identical 401 for unknown email, wrong password, disabled or locked accounts; logs carry `userId` or a hashed email only.

### Changed

- `@Public()` lives in `src/common/` so health stays free of auth imports; `MongoRepository`/`PostgresRepository` expose `model`/`db`/`table` as `protected` for adapter-specific atomic operations.

## [0.4.0] - 2026-11-22

### Added

- **18:09 — `d747250` docs: add full project context to AGENTS.md and CLAUDE.md import**
  - Root `AGENTS.md` summarizes the target project (M00–M16): architecture, structure, stack, modules, rules, workflow and progress.
  - `CLAUDE.md` imports `AGENTS.md`, which stays canonical.
- **feat(api): add Postgres adapter on Drizzle (M05)**
  - `infra/database/postgres` (`@module:db-postgres`, present but not wired by default): `PostgresDatabaseModule.forRoot()` (lazy `pg.Pool`, env-driven pool/timeouts, graceful `pool.end()`), `PostgresRepository` on Drizzle (uuid v7 ids, `created_at`/`updated_at`), `PostgresQueryTranslator`, `select 1` health indicator and SQLSTATE `23505` → `ConflictError(field)` from `<table>_<column>_unique`.
  - The unmodified M04 repository contract suite passes on PGlite; new specs for the mapper, translator, health, module and a no-`sql.raw` guard.
  - `drizzle.config.ts`, `migrations/`, `db:generate` / `db:migrate` (migrations never run on boot).
  - `compose.dev.yaml` Postgres service (healthcheck, named volume) and a non-superuser `app` role (`docker/postgres/init`).
  - ADR-0005; "Switching database engine" section in `apps/api/AGENTS.md`.

### Security

- `contains` escapes `%`, `_` and `\`; filter values are bound parameters coerced to the column type; ESLint keeps `drizzle-orm`/`pg`/`@electric-sql/pglite` inside the adapter and Mongo drivers out of it.

### Changed

- The Mongo adapter and the config-fixture specs no longer depend on `AppConfig` carrying `MONGO_*`, so either engine's regions can be switched off; `db-mongo.markers.spec.ts` now checks both modules.

## [0.3.0] - 2026-11-22

### Added

- **15:00 — `66437b3`, `e12e70d`, `d1005d5` feat(api): add db-core ports and Mongo adapter (M04)**
  - `infra/database/core`: `Repository`/`QueryTranslator`/`DatabaseHealth` ports, `DbError` family and a reusable repository contract suite.
  - `infra/database/mongo` (`@module:db-mongo`): Mongoose adapter with whitelisted filter/sort translation, regex escaping, `sanitizeFilter`, E11000 → `ConflictError`, background connect, health ping and `db:sync-indexes`.
  - `GET /api/v1/health/ready` (200 ok / 503 down); `/health/live` stays process-only.
  - `SERVICE_UNAVAILABLE` error code; `AllExceptionsFilter` maps `DbError`s (404, 409 with `details.field`, 400, 503).
  - `compose.dev.yaml` Mongo service and `pnpm dev:db`; `MONGO_URI`/`MONGO_TIMEOUT_MS` env.
  - ESLint `no-restricted-imports` keeps `mongoose`/`mongodb` inside the adapter; coverage gate ≥ 85% on `infra/database/**`.
  - ADR-0004 (DB behind ports; one primary engine per app).

### Security

- Bad client input can no longer cause a 500: Mongoose cast/validation errors map to 400 `VALIDATION_FAILED`, and object values for `eq`/`ne` are rejected by the translator.
- `MONGO_URI` is required in production (`.meta({ requiredInProduction: true })` is honoured by `composeEnvSchema`); `id`/`_id`/`$` keys are rejected on `create`/`update`.

### Changed

- Constants, types and the health interface live in their own files (`core/constants.ts`, `core/health.ts`, `mongo/mongo.constants.ts`, `mongo/mongo.types.ts`); driver-error mapping moved to `mongo/mongo-error.mapper.ts`.
- `compose.dev.yaml` host port is overridable with `MONGO_PORT`; `sync-indexes` awaits the connection first.

## [0.2.1] - 2026-11-15

### Fixed

- **21:10 — `12fb842` fix(api): exempt health from throttling and harden logging and secrets**
  - `GET /api/v1/health/live` is no longer rate limited, so Docker/orchestrator probes cannot get 429.
  - Fatal `uncaughtException`/`unhandledRejection` handlers emit one pino-shaped JSON line and exit 1.
  - Logged `req.url` drops the query string (no tokens in logs); the request id now has a single source (the middleware).
  - Production rejects low-entropy secrets (< 8 distinct characters); removed the unused `secretFragment` helper and the hard-coded Swagger title.

### Changed

- **`a0405aa` build(api): rename vitest configs to .mts** — removes the Vite ESM-in-CommonJS warning.

### Added

- **`894cc96` test(api): cover remaining AC gaps and restore env after e2e**
  - New tests: log-line request id, 200-char id replacement, HSTS, allowlisted CORS, docs UI 404 in production, never-throttled health.
  - `withEnv` test helper restores `process.env` even when assertions fail.

## [0.2.0] - 2026-11-15

### Added

- **20:32 — `e8c724f` feat(api): add NestJS api core (M03)**
  - `apps/api`: NestJS 11 / Express 5 app with `/api` prefix, URI versioning (`v1`), shutdown hooks and fatal-error handlers that log and exit non-zero.
  - Zod-validated env with a composable fragment builder; boot fails listing every invalid variable, and production rejects `CORS_ORIGIN` containing `*`/`null` and weak or example secrets.
  - Global `ZodValidationPipe` and `ZodSerializerInterceptor` (`nestjs-zod`) and a catch-all exception filter rendering the `ErrorEnvelope` (`VALIDATION_FAILED`, `NOT_FOUND`, `RATE_LIMITED`, `INTERNAL`) with `requestId`; 5xx messages are hidden in production.
  - Request-id middleware (uuid/ulid ≤ 64 chars accepted, else uuid v7) shared with pino; redacted JSON logs via nestjs-pino.
  - helmet, CORS allowlist (`credentials: false`), `@nestjs/throttler`, `GET /api/v1/health/live` and OpenAPI at `/api/docs` (off in production unless `API_DOCS_ENABLED=true`).
  - Vitest + SWC unit tests (97% line coverage on `common/` and `config/`) and supertest e2e tests; ADR-0003 (nestjs-zod, NodeNext resolution) and `apps/api/AGENTS.md`.

### Changed

- `pnpm-workspace.yaml`: `onlyBuiltDependencies` replaced by `allowBuilds` (`@swc/core` allowed) so the SWC install script can run.
- **`7e7e660` docs: tick M03 tasks and mark done** — M03 milestone and plan row set to Done.

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
