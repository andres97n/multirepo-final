# Forking a new project

> Draft from M13: covers CI, Renovate and `platform-config`. M15 completes the rest (the new-project flow in full and updating a child from the base).

## New project (short version)

1. Clone the base. Don't fork it unless you will contribute back.
2. Delete `.git` and run `git init` with one clean commit.
3. Run `/scaffold` to pick the DB engine and modules.
4. Customize only env, branding and deploy config.
5. Record the decisions and dependency versions in an ADR.

## CI and dependency policy in a child

A child keeps two thin files. All shared policy lives in [`andres97n/platform-config`](https://github.com/andres97n/platform-config) (ADR-0013).

### `.github/workflows/ci.yml`

Keep the base's file. It calls the reusable workflows pinned by commit SHA, with the release as a comment:

```yaml
quality:
  uses: andres97n/platform-config/.github/workflows/quality.yml@<sha> # v1.0.0
```

What the child owns:

- The `commands` list of each job (add or remove gates).
- The combos in the matrix jobs. After `/scaffold` removes a module or engine, keep only the combos that still exist. A child that has one fixed selection can delete the matrix jobs and the `changes` job.
- `image-budgets-mb` (from `perf-budgets.json`, M14).

Keep the scripts the workflows call: `scripts/ci-prepare.mjs`, `scripts/ci-changes.mjs`, `scripts/audit-gate.mjs` and `scripts/combos.mjs`.

### `renovate.json`

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["github>andres97n/platform-config#v1"],
  "packageRules": []
}
```

Put project-only exceptions in `packageRules`, for example holding back a package. Don't copy the preset's rules into the child.

Install the [Renovate GitHub app](https://github.com/apps/renovate) on the child repository. The onboarding PR and the "Dependency Dashboard" issue confirm that the preset resolved.

### Upgrading platform-config

- Renovate's `github-actions` manager proposes a PR that bumps the SHA in `ci.yml`. Merge it once the child's CI passes, which makes every upgrade a reviewed change.
- The preset follows the floating `v1` tag, so policy fixes arrive without a PR.
- A new major (`v2`) means breaking input changes. Read the platform-config `CHANGELOG.md` and update `ci.yml` and `renovate.json` together.

### Branch protection (recommended)

On `main`, and on `develop` if you use it:

- Require a pull request before merging.
- Require the status check **`ci-ok`** to pass. It aggregates every job; skipped matrix jobs count as passing.
- Require branches to be up to date before merging.
- Block force pushes and deletions.

### Security exceptions

Accepted findings go in `.security/exceptions.json` with an expiry date. CI fails once an entry expires. See `SECURITY.md#exceptions`.
