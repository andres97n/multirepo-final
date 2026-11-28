# ADR-0013 — Central platform-config: Renovate preset + reusable CI workflows

- Status: Accepted
- Date: 2026-11-28
- Supersedes: — / Superseded-by: —

The M13 milestone file names this "ADR-0012". That number was taken by the Docker ADR, so this decision is ADR-0013.

## Context

Every project cloned from this boilerplate needs the same dependency policy and the same CI gates. If each child carried full copies, a policy fix would need N hand edits and the copies would drift (NFR-MAINT-1/2). CI also has to:

- Prove the four module combos still build and pass (ADR-0011).
- Run the security tooling with documented blocking levels (NFR-SEC-4/5/6).
- Enforce coverage thresholds (NFR-QUAL-2).

## Decision

1. **One public repo, `andres97n/platform-config`**, holds the Renovate preset (`default.json`) and the reusable workflows `quality`, `e2e`, `security` and `docker` (`on: workflow_call`). It is versioned with semver tags, plus a floating major tag (`v1`).
2. **The workflows are generic.** They set up Node and pnpm from the caller's `.nvmrc` and `packageManager`, restore caches (pnpm store, Turbo, MongoDB binary, Playwright browsers, Trivy DB), then run caller-supplied `prepare-command` and `commands`. Project logic stays in this repo's scripts, so it evolves with the base:
   - `scripts/ci-prepare.mjs [combo]`: install, or apply a module combo, re-resolve the lockfile and regenerate Postgres migrations. It then writes `.env` files with random secrets.
   - `scripts/ci-changes.mjs <base>`: decides whether the full matrix must run.
   - `scripts/audit-gate.mjs`: runs `pnpm audit` and checks exception expiry.
3. **Pinning:**
   - Children pin each reusable workflow by **commit SHA** with a `# vX.Y.Z` comment, and the preset by major (`github>andres97n/platform-config#v1`).
   - Every third-party action is pinned by SHA and every tool image by digest. Renovate (`helpers:pinGitHubActionDigests`, `docker:pinDigests`) proposes upgrades as normal PRs.
   - Breaking input changes require a new major tag.
4. **Matrix policy:**
   - Every PR and push to `develop`/`main` runs the default selection (mongo+auth): quality, e2e (api + Playwright), security and docker.
   - The other three combos (mongo, postgres, postgres+auth) run quality and e2e only when the diff touches the module system (`modules.json`, apply scripts, any module path or marked file, dependency files), nightly on `main`, and on manual dispatch.
   - One aggregate job, `ci-ok`, is the only required check, so skipped matrix jobs never block a merge.
5. **Blocking levels** (also in `SECURITY.md`):

   | Tool              | Blocks on                                                                         |
   | ----------------- | --------------------------------------------------------------------------------- |
   | gitleaks          | any finding in history                                                            |
   | CodeQL            | error-level alerts                                                                |
   | `audit-gate`      | high/critical prod advisories without a live exception, and any expired exception |
   | dependency-review | high, GPL-3.0/AGPL-3.0                                                            |
   | Trivy             | CRITICAL                                                                          |
   | coverage          | per-workspace thresholds (`pnpm test:coverage`, new Turbo task)                   |

   Test fixtures with deliberate dummy secrets are allowlisted by path in `.gitleaks.toml`.

6. **Exceptions** move from the `SECURITY.md` table to `.security/exceptions.json`, as JSON so the gate needs no YAML parser dependency. Each entry has `id`, `tool`, `advisories`, `reason`, `owner` and `expires` (YYYY-MM-DD). `pnpm-audit` entries suppress the listed advisories until they expire. An expired entry of any tool fails CI.
7. **Security posture of every workflow:**
   - Top-level `permissions: {}` and per-job grants.
   - `persist-credentials: false`.
   - Inputs reach the shell only through `env:`.
   - No `pull_request_target`.
   - `self-ci` in platform-config runs actionlint, zizmor, a SHA-pinning check and the Renovate validator.

## Alternatives

- **Full workflow copies in each child:** simple, but drifts, and every fix is N edits. Rejected (NFR-MAINT-1).
- **Opinionated workflows that know about modules and env files:** fewer inputs, but platform-config would have to change whenever the base's scripts change, and non-boilerplate repos couldn't reuse them. Rejected in favour of generic runners and project scripts.
- **Composite actions instead of reusable workflows:** a composite referenced from a reusable workflow would need its own SHA pin, which creates a chicken-and-egg problem on every release. The few duplicated setup steps are cheaper.
- **The full matrix on every PR:** about four times the CI minutes for changes that cannot affect module pruning. Rejected; the change detector plus nightly runs cover it.
- **gitleaks-action, trivy-action:** extra third-party JavaScript running with the job token. The official images pinned by digest do the same job.
- **YAML exceptions file (as M13 first planned):** needs a parser dependency for one small file. JSON is read with the stdlib.
- **A `perf.yml` skeleton now:** it would only duplicate `quality.yml`. M14 adds a perf workflow when Lighthouse CI needs its own setup.

## Consequences

- **Bootstrap order:** platform-config must be published and tagged before this repo's CI can run. Its commit SHA appears in `.github/workflows/ci.yml`.
- **Upgrades are reviewed changes.** A platform-config release reaches a child only when its Renovate PR (a SHA bump) passes that child's CI.
- **Postgres e2e:** the Postgres combos run Playwright against a real Postgres through `compose.dev.yaml` (port 5434). This is the real-engine e2e promised in ADR-0005; api e2e stays on PGlite.
- **Docker:**
  - The job reports image sizes. Budgets arrive with M14 through the `image-budgets-mb` input.
  - No buildx layer cache yet; add a gha cache if image builds dominate CI time.
- **Scheduled runs:** they use the default branch (`main`), so the nightly matrix covers `main` only. Changes on `develop` rely on the change detector or a manual dispatch.
- **Code scanning:** CodeQL results upload to the repo's code-scanning tab. The error-level gate is a SARIF check inside the job, so it does not depend on repository rulesets.
