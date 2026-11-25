# M12 — Docker

| Field      | Value                                                                    |
| ---------- | ------------------------------------------------------------------------ |
| Status     | Done                                                                     |
| Depends on | [M11](./M11-module-system.md)                                            |
| PRD refs   | NFR-DEP-1, NFR-DEP-2, NFR-PERF-3, NFR-SEC-7, NFR-DX-1, §9 acceptance (4) |
| Axes       | 6 (Infrastructure & deployment)                                          |

> ADR number: the decision is recorded as **ADR-0012** (`docs/adr/0012-docker-turbo-prune-compose.md`); ADR-0011 was already taken by the module manifest.

## Goal

Production images for api and web, built through `turbo prune`. They are small, non-root and health-checked, plus compose files for dev (DBs only) and prod-like (full stack) runs. Both adapt to the selected modules.

## Scope

`apps/api/Dockerfile`, `apps/web/Dockerfile`, `.dockerignore`, `compose.yaml`, `compose.dev.yaml`, image-size baseline.

## Out of scope

- Registry push, cloud-specific manifests, Kubernetes. The CI docker workflow is M13.

## Tasks

- [x] Shared pattern for both Dockerfiles:
  1. `pruner`: `turbo prune <app> --docker`.
  2. `deps`: `pnpm fetch` + `pnpm install --offline --frozen-lockfile` on `out/json`, with a cache mount for the pnpm store.
  3. `build`: copy `out/full`, `turbo run build --filter=<app>`.
  4. `runtime`: minimal base, non-root user, only the production output.
- [x] api runtime: `pnpm deploy --prod` output (or pruned `node_modules` + `dist`), `node dist/main.js`, `HEALTHCHECK` on `/api/v1/health/live`, `NODE_ENV=production`, `tini` (or `--init`) for signal handling.
- [x] web runtime: Next `standalone` + `.next/static` + `public`, `node server.js`, `HEALTHCHECK` on `/api/health`.
- [x] Pin base images by digest (Renovate updates them). Same Node major as `.nvmrc`.
- [x] Native deps (argon2) build in the build stage; verify the runtime has the needed libc.
- [x] `.dockerignore`: node_modules, .next, dist, .turbo, coverage, .env*, .git, docs, e2e artifacts.
- [x] `compose.yaml` (prod-like):
  - api, web and the selected DB (`@module:db-*` markers).
  - Healthchecks and `depends_on: condition: service_healthy`.
  - Secrets via env_file (gitignored), read-only root filesystem where possible, `restart: unless-stopped`.
- [x] `compose.dev.yaml`: only DB services for host development (from M04/M05).
- [x] Script `docker:smoke`: build images, `compose up -d`, wait for healthy, curl health endpoints, run Postgres migrations if selected, `compose down -v`.
- [x] Record the baseline image sizes (input for M14 budgets).

## Deliverables

`apps/{api,web}/Dockerfile`, `.dockerignore`, `compose.yaml`, `compose.dev.yaml`, `scripts/docker-smoke.mjs`, baseline sizes recorded in `perf-budgets.json` (draft).

## Acceptance criteria

### Functional

- **AC-M12.1** `docker compose up -d --build` brings api, web and the DB to `healthy` within 90 s on a dev machine.
- **AC-M12.2** `pnpm docker:smoke` passes for the default selection (mongo + auth) and for postgres without auth (after `modules:apply`).
- **AC-M12.3** The web container reaches the api through the compose network (`/api/health?deep=1` → 200).
- **AC-M12.4** Containers stop gracefully on SIGTERM within 10 s (api closes the DB pool; logs show shutdown).
- **AC-M12.5** A code change in `apps/web` does not invalidate the api image's dependency layer (layer cache check).

### Security

- **AC-M12.6** Both images run as a non-root UID (`docker inspect` → `User` set; `id -u` ≠ 0 inside).
- **AC-M12.7** Images contain no `.env`, source `.ts` files outside the needed output, `.git`, devDependencies or package manager caches (checked by an inspection script).
- **AC-M12.8** Base images are pinned by digest.
- **AC-M12.9** A vulnerability scan (Trivy or Grype) reports no CRITICAL in the runtime image. HIGH findings are listed and handled through the SECURITY.md exception process.

### Performance

- **AC-M12.10** Image sizes are measured and recorded as the baseline (targets: api < 250 MB, web < 200 MB uncompressed; adjusted in M14 from the measurement).

### Docs

- **AC-M12.11** ADR-0011 "Container build via turbo prune; compose layout" is written. README has a "Run with Docker" section. Each app's AGENTS.md notes the Dockerfile stages.

## Verification

```bash
docker compose up -d --build && docker compose ps    # all healthy
pnpm docker:smoke
docker run --rm --entrypoint id <api-image> -u        # not 0
docker image ls | grep -E "api|web"                  # sizes
trivy image <api-image> --severity CRITICAL --exit-code 1
```

## ADRs produced

- ADR-0011 Docker images via `turbo prune`, runtime layout, compose files.

## Risks & mitigations

| Risk                                         | Mitigation                                                                 |
| -------------------------------------------- | -------------------------------------------------------------------------- |
| argon2 prebuilt binaries vs musl (Alpine)    | Use a Debian-slim base if Alpine fails, and record the choice in ADR-0011. |
| `pnpm deploy` and turbo prune interplay      | Validate early; fall back to copying pruned node_modules.                  |
| Next standalone misses files (sharp, public) | Smoke test loads an image or static asset.                                 |

## Definition of Done

All ACs pass, ADR-0011 is merged, the commit is made and the status is set to Done.
