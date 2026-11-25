# M13 — platform-config repo + CI

| Field      | Value                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| Status     | Not started                                                                                                   |
| Depends on | [M11](./M11-module-system.md), [M12](./M12-docker.md)                                                         |
| PRD refs   | NFR-SEC-4, NFR-SEC-5, NFR-SEC-6, NFR-MAINT-1, NFR-MAINT-2, NFR-QUAL-1, NFR-QUAL-2, §9 acceptance (1, 2, 4, 5) |
| Axes       | 4 (Quality), 5 (Security), 6 (Infra), cross-cutting maintenance                                               |

> Numbering note: ADR-0012 is taken by M12 (Docker), so this milestone's ADR becomes **ADR-0013**. `SECURITY.md` already exists as a draft from M12 (reporting, blocking severities, exception table); this milestone extends it with `.security/exceptions.yaml` and CI enforcement.

## Goal

A central `andres97n/platform-config` repo holds the Renovate presets and reusable GitHub workflows, versioned by tag. The boilerplate (and every child) has a thin `renovate.json` and a thin `ci.yml` pinned to those versions, including the module matrix.

## Scope

New sibling repo `platform-config/`: Renovate preset and reusable workflows. In the boilerplate: `ci.yml`, `renovate.json`, `SECURITY.md`.

## Out of scope

- Perf workflow thresholds (M14 fills them in; the workflow skeleton is created here). Deployment/CD.

## Tasks

### platform-config repo

- [ ] `default.json` (Renovate preset):
  - Base: `config:recommended`, `:semanticCommits`, `:dependencyDashboard`, timezone, schedule.
  - Groups: nestjs, next+react, typescript+eslint tooling, testing (vitest, playwright), types, docker base images, github-actions.
  - `minimumReleaseAge` (3 days, longer for majors).
  - Automerge only devDependency patch/minor with passing CI; never majors or runtime deps.
  - `vulnerabilityAlerts` labeled `security` with no schedule delay.
  - Lockfile maintenance weekly; `pinDigests` for actions and docker.
  - No deprecated keys (validated with `renovate-config-validator`).
- [ ] Reusable workflows (`on: workflow_call`, typed `inputs`):
  - `quality.yml`: checkout, pnpm setup + store cache, turbo cache; format:check, `modules:check`, lint, typecheck, test with coverage (thresholds enforced), build.
  - `e2e.yml`: api e2e with DB service (input `db`), Playwright with prod build (input `auth`); upload traces on failure.
  - `security.yml`:
    - gitleaks (full history on PR; blocks on any finding).
    - CodeQL JS/TS (blocks on `error` severity).
    - `pnpm audit --prod --audit-level=high` (blocks high/critical in production deps; dev deps report only).
    - `dependency-review` on PRs (fails on high plus disallowed licenses).
  - `docker.yml`: build images (buildx + cache), smoke via compose, Trivy scan (blocks CRITICAL), image size check against an input budget.
  - `perf.yml`: skeleton; bundle and LHCI steps wired in M14.
  - All workflows: top-level `permissions: {}` with per-job minimal grants, every `uses:` pinned by full SHA (comment with version), `concurrency` cancel-in-progress, `timeout-minutes` set.
- [ ] Self-CI for platform-config: actionlint, renovate-config-validator, zizmor (workflow security lint).
- [ ] Release: tag `v1.0.0` and move the floating `v1` tag; CHANGELOG.

### Boilerplate

- [ ] `.github/workflows/ci.yml` (PR + push main):
  - Calls quality, security and docker on the default selection.
  - **Module matrix** job: for {mongo, mongo+auth, postgres, postgres+auth}, run `modules:apply`, then quality + e2e.
  - Reusable workflows referenced by SHA (Renovate keeps them updated).
- [ ] `renovate.json`: `{ "extends": ["github>andres97n/platform-config#v1"] }` plus a documented `packageRules` slot for local exceptions.
- [ ] `SECURITY.md`:
  - Supported versions; how to report.
  - Blocking-severity table per tool.
  - Exception process: `.security/exceptions.yaml` with id, reason, owner and expiry date. Expired exceptions fail CI.
- [ ] Branch protection recommendations documented (required checks list).

## Deliverables

`platform-config/{default.json,.github/workflows/*.yml,README.md,CHANGELOG.md}`; boilerplate `.github/workflows/ci.yml`, `renovate.json`, `SECURITY.md`, `.security/exceptions.yaml`.

## Acceptance criteria

### Functional

- **AC-M13.1** platform-config is published on GitHub and tagged `v1.0.0`/`v1`. Its self-CI (actionlint, renovate validator, zizmor) is green.
- **AC-M13.2** A boilerplate PR runs quality, security, docker, e2e and the 4-combo module matrix. All are green.
- **AC-M13.3** A deliberately broken combo (e.g. an unbalanced marker) fails `modules:check` and the matrix job.
- **AC-M13.4** A second CI run on an unchanged commit restores the turbo and pnpm caches (visible cache hit, faster run).
- **AC-M13.5** Renovate onboarding on the boilerplate resolves the preset with no config errors, and the dashboard issue appears.

### Security

- **AC-M13.6** Every `uses:` in both repos references a 40-char SHA (an actionlint/zizmor or grep check enforces this).
- **AC-M13.7** No workflow has `permissions: write-all` or a default write token. Each job declares minimal permissions.
- **AC-M13.8** Committing a fake secret (test branch) is blocked by gitleaks.
- **AC-M13.9** Adding a dependency with a known high vulnerability to production deps fails `pnpm audit`. Adding an exception with a future expiry passes; a past expiry fails.
- **AC-M13.10** `pull_request_target` is not used. Workflows do not interpolate untrusted input into `run:` (zizmor clean).

### Quality

- **AC-M13.11** Full CI on a PR finishes in < 20 min wall-clock with the matrix parallelized (measured and recorded).
- **AC-M13.12** Coverage thresholds from M02–M09 are enforced in CI, not only locally.

### Docs

- **AC-M13.13** ADR-0012 "Central platform-config: Renovate presets + reusable workflows" is written. `docs/FORKING.md` (draft) explains how a child pins and upgrades platform-config. `SECURITY.md` is complete.

## Verification

- Open a PR in the boilerplate and check that every job is green.
- Push test branches: one with a fake AWS key (gitleaks fails), one with a vulnerable dep (audit fails), one with an unbalanced marker (matrix fails).
- `grep -rnE "uses: [^@]+@(v[0-9]|main|master)" .github platform-config/.github` → no matches.

## ADRs produced

- ADR-0012 Central platform-config repo (Renovate presets + reusable CI), pinning and upgrade policy.

## Risks & mitigations

| Risk                                                                    | Mitigation                                                                                                     |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Bootstrap order: boilerplate CI can't run before platform-config exists | Publish platform-config first; until then run `pnpm modules:matrix` locally.                                   |
| Reusable workflow changes break children                                | Semver tags; children pin by SHA; Renovate PRs show the diff; breaking changes need a major tag.               |
| Private repo access for reusable workflows                              | Make platform-config public, or configure org access settings; documented.                                     |
| Matrix cost                                                             | Run the matrix on PRs touching `modules.json`/markers plus nightly on main; the default selection always runs. |

## Definition of Done

All ACs pass, both repos are green, ADR-0012 is merged, the commit is made and the status is set to Done.
