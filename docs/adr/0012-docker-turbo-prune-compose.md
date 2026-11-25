# ADR-0012 — Docker images via turbo prune; runtime layout; compose files

- Status: Accepted
- Date: 2026-11-25
- Supersedes: — / Superseded-by: —

The M12 milestone file names this "ADR-0011". That number was already taken by the module manifest ADR, so this decision is ADR-0012.

## Context

M12 needs production images for `apps/api` and `apps/web`. They must be small, run as non-root and be health-checked. Rebuilding one app must not rebuild the other's dependencies. The images must also follow the module selection (`db-mongo` or `db-postgres`, with or without `auth`) without hand edits. Constraints:

- argon2 is a native addon.
- `next.config.ts` validates env at build time and bakes `serverActions.allowedOrigins` from `APP_ORIGIN`.
- Postgres migrations are an explicit step, never run on boot (ADR-0005), and `drizzle-kit` is a devDependency.

## Decision

- **Same four stages in both Dockerfiles** (`apps/<app>/Dockerfile`, built from the repo root):
  1. `pruner`: `turbo prune <app> --docker`.
  2. `deps`: `pnpm fetch` + `pnpm install --offline --frozen-lockfile` on `out/json`, with a BuildKit cache mount for the store.
  3. `build`: `turbo run build --filter=<app>`.
  4. `runtime`: the final image.

  A change in one app leaves the other app's `deps` layer cached. The `pruner` stage still re-runs.

- **Base image:** `node:24-trixie-slim` (glibc, Debian 13), pinned by digest. Renovate updates the digest. glibc lets argon2 load its prebuilt binary, so no compiler is needed. We picked trixie over bookworm because bookworm's `zlib1g` carries CRITICAL CVE-2023-45853, which has no fix there.
- **No package manager at runtime.** The runtime stage deletes npm, npx, corepack and yarn. That removes their bundled CVEs, and nothing at runtime needs them.
- **api runtime:**
  - The app comes from `pnpm --filter=api deploy --prod --legacy`. `package.json#files` is `["dist", "migrations"]`, so no TS source ships.
  - Runs as `USER node`, with `CMD node dist/main.js`.
  - The `HEALTHCHECK` runs `node -e fetch(...)` against `/api/v1/health/live`, because the slim image has no curl.
  - On SIGTERM, Nest shutdown hooks close the DB connections. `LoggerModule` then logs `shutting down (SIGTERM)`.
- **Postgres migrations in the image:** `node dist/infra/database/postgres/migrate.js` applies `/app/migrations` with the runtime `drizzle-orm` migrator. It is a one-off deploy step (`docker compose run --rm api node dist/infra/database/postgres/migrate.js`), never part of boot. It lives in the db-postgres folder, so `modules:apply --db=mongo` prunes it.
- **web runtime:**
  - Next `standalone` output plus `.next/static`, started with `node apps/web/server.js`.
  - Sets `HOSTNAME=0.0.0.0` and runs as `USER node`.
  - The `HEALTHCHECK` targets `/api/health`.
  - The build stage gets `APP_ORIGIN` (a build arg), `API_URL=http://api:3001` and a build-only placeholder `SESSION_SECRET`. These exist only in the build stage. Real secrets come from env at runtime.
- **`compose.yaml` (prod-like):**
  - Has its own project name, `app-stack`, so `down -v` never touches the volumes of `compose.dev.yaml`.
  - Services `api` and `web`, plus `mongo` and `postgres` inside `# @module:db-*` regions. Both DB services are live, as in `compose.dev.yaml`, because `modules:apply` can only uncomment `KEY=value` lines. Applying a selection strips the other engine.
  - Secrets come from gitignored `docker/api.env` and `docker/web.env`. Their templates are `docker/*.env.example`, which carry the same module regions.
  - Each container has `init: true`, `read_only: true` with tmpfs mounts, `no-new-privileges` and `restart: unless-stopped`.
  - `depends_on` waits for `service_healthy`. DB ports are not published, and the app ports bind to 127.0.0.1.
- **`pnpm docker:smoke` (`scripts/docker-smoke.mjs`):**
  - Builds and starts the stack as compose project `smoke` on ports 3916/3917, with throwaway secrets.
  - On a Postgres tree, it runs the migrator twice first.
  - Checks: health (including web → api over the compose network), a static asset, a non-root uid, no leaked files/devDeps/package managers, and SIGTERM handling (under 10 s, shutdown logged).
  - Always tears down with `down -v`.
  - `scripts/live-check/docker-postgres.sh` runs the same checks on a copy of the tree pruned to Postgres without auth.

## Alternatives

- **Alpine.** Smaller, but argon2 on musl risks a source build, and the size gain is small next to the 120 MB node binary.
- **Distroless.** Has no shell, which breaks the `id -u` and leak checks and makes debugging harder. Can be revisited in M14 if size budgets demand it.
- **`tini` installed by apt.** `init: true` in compose gives the same signal forwarding without an extra package.
- **Running migrations on boot.** Rejected by ADR-0005.

## Consequences

- Baseline sizes are in `perf-budgets.json` (draft, from `docker:smoke`). The api image (452 MB as listed by Docker, 318 MB on disk) and the web image (392 MB listed, 261 MB on disk) are above the milestone's targets (api < 250 MB, web < 200 MB). About 220 MB of each is the Debian base plus the node binary. M14 sets real budgets from this measurement.
- **Trivy (2026-11-25):** 0 CRITICAL in both runtime images.
  - 51 HIGH, all Debian OS packages: util-linux family, gzip, libacl1, pam, systemd libs, ncurses, perl-base, zlib1g, libzstd1.
  - 50 have no fixed version upstream yet. `libzstd1` has a fix that arrives with the next base digest.
  - These are accepted until Renovate bumps the digest. Re-scan on every base bump (M13 CI).
- `APP_ORIGIN` must match between the build arg and the runtime env. The web example env file says so.
- The api logs one line on shutdown, `shutting down (<signal>)`, after the DB connections are closed. Log-based alerting can rely on it.
