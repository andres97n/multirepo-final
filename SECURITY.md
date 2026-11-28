# Security policy

## Reporting a vulnerability

Report privately through GitHub: **Security → Report a vulnerability** (a private security advisory) on this repository. Do not open a public issue.

Include the affected path or endpoint, the steps to reproduce and the impact. You will get an acknowledgement within 7 days. Fixes ship as a patch release with a `Security` entry in `CHANGELOG.md`.

## Supported versions

Only the latest release on `main`, and `develop` while it is in progress, get security fixes. Projects forked from this boilerplate pull fixes selectively, using the `Security` sections of `CHANGELOG.md`.

## Secure defaults

The full list is in `AGENTS.md` ("Key behaviours") and the ADRs. In short:

- **Config:** env is validated at boot. Production rejects weak or example secrets and `CORS_ORIGIN=*`.
- **Credentials:** passwords use Argon2id. Refresh tokens are opaque, rotated and stored hashed. The browser only gets an encrypted httpOnly session cookie.
- **Logs:** they never contain secrets. Authorization headers, cookies, passwords, tokens and connection-string credentials are redacted.
- **Containers (ADR-0012):**
  - Images run as non-root, with no package manager and no source or `.env` files.
  - Base images are pinned by digest.
  - Database credentials come only from gitignored env files, Mongo runs with authentication, and the app uses least-privilege DB users.
- **Supply chain:** dependencies are pinned exactly, `minimumReleaseAge` holds back fresh releases, and install scripts are opt-in.

## Blocking severities

CI runs these through the reusable workflows in [`andres97n/platform-config`](https://github.com/andres97n/platform-config) (ADR-0013). Each check runs on every pull request and every push to `develop` and `main`.

| Tool                             | Scope                                                 | Blocks on                                                                  |
| -------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------- |
| gitleaks                         | full git history                                      | any finding (test fixtures allowlisted by path in `.gitleaks.toml`)        |
| CodeQL (`javascript-typescript`) | repository sources                                    | an `error`-level alert; an alert whose rule can't be resolved fails closed |
| `scripts/audit-gate.mjs`         | `pnpm audit`, production dependencies                 | high/critical without a live exception; **any** expired exception          |
| dependency-review                | dependency changes in a pull request                  | new high/critical advisories; GPL-3.0 or AGPL-3.0 licenses                 |
| Trivy (`--scanners vuln`)        | api and web runtime images (`smoke-api`, `smoke-web`) | CRITICAL                                                                   |

Moderate and lower advisories, dev-only advisories and HIGH image findings are reported but don't block. Each one is either fixed or recorded as an exception.

## Exceptions

Exceptions live in [`.security/exceptions.json`](./.security/exceptions.json). Each entry records a known finding that is accepted for a limited time:

| Field        | Meaning                                                                                   |
| ------------ | ----------------------------------------------------------------------------------------- |
| `id`         | `EXC-<year>-<n>`, never reused                                                            |
| `tool`       | `pnpm-audit`, `trivy`, `codeql`, `gitleaks` or `dependency-review`                        |
| `advisories` | GHSA/CVE ids. For `pnpm-audit` these are the advisories the gate stops blocking           |
| `finding`    | what was found                                                                            |
| `reason`     | why it is accepted (no fix upstream, not reachable, …)                                    |
| `owner`      | who reviews it                                                                            |
| `expires`    | `YYYY-MM-DD`. From the next day, CI fails until the entry is renewed or the finding fixed |

Process:

1. **Add:** fix the finding if you can. If not, add an entry in the same PR that introduces or reveals it, with a short expiry (90 days at most).
2. **Renew:** renewing means a new `reason` and a new `expires`, reviewed like any change. Don't just bump the date.
3. **Remove:** delete the entry when the finding is gone.

`node scripts/audit-gate.mjs` runs the same check locally.
