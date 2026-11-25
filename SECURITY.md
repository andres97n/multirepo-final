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

| Tool                                       | Scope                           | Blocks         |
| ------------------------------------------ | ------------------------------- | -------------- |
| Trivy (`--scanners vuln`)                  | api and web runtime images      | CRITICAL       |
| `pnpm audit`, CodeQL, gitleaks, dep-review | repository (CI, arrives in M13) | defined in M13 |

HIGH findings do not block, but each one is either fixed or recorded below.

## Exceptions

An exception records a known finding that is accepted for a limited time. Each one has an id, the finding, the reason, an owner and a review date. An exception past its review date must be renewed with a new reason, or the finding fixed.

| Id         | Finding                                                                                                                                                           | Reason                                                                                                                                                                           | Owner                  | Review by                                  |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------ |
| EXC-2026-1 | 51 HIGH CVEs in Debian 13 OS packages of `node:24-trixie-slim` (util-linux, gzip, libacl1, pam, systemd libs, ncurses, perl-base, zlib1g, libzstd1); see ADR-0012 | 50 have no upstream fix yet, and the libzstd1 fix arrives with the next base digest. No CRITICAL. The packages are part of the base OS, and the app does not call them directly. | Boilerplate maintainer | Next base-image digest bump, or 2027-02-25 |

M13 moves this table to `.security/exceptions.yaml`, where CI fails on expired entries.
