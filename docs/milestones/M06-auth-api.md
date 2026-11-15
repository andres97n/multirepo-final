# M06 — Auth module (api)

| Field      | Value                                                               |
| ---------- | ------------------------------------------------------------------- |
| Status     | Not started                                                         |
| Depends on | [M04](./M04-db-core-mongo.md), [M05](./M05-db-postgres.md)          |
| PRD refs   | FR-2.1–FR-2.7, FR-2.9, FR-3.1, FR-3.3, FR-4.2, NFR-SEC-1, NFR-SEC-7 |
| Axes       | 1 (Modular), 2 (Contracts), 5 (Security)                            |

## Goal

A removable `auth` module providing local email and password login. It uses Argon2id, short-lived access JWTs, rotating refresh sessions with reuse detection, progressive lockout and RBAC, and works identically on Mongo and Postgres.

## Scope

`modules/auth/**`: users and sessions ports + adapters for both engines, services, controllers, guards, decorators, seed command, admin users listing.

## Out of scope

- Web BFF (M09), OAuth/social login, email verification, password reset (documented as future optional modules).

## Tasks

- [ ] Ports:
  - `UsersRepository` (`findByEmail`, `create`, `recordFailedLogin`, `resetFailedLogins`, `list(PageQuery, FilterSpec)`).
  - `SessionsRepository` (`create`, `findByTokenHash`, `rotate`, `revoke`, `revokeFamily`, `revokeAllForUser`, `deleteExpired`).
- [ ] Mongo and Postgres implementations of both, with indexes and constraints (unique email, unique tokenHash, index on userId and familyId). Each implementation extends the M04 contract suite with auth-specific cases.
- [ ] `PasswordService`:
  - Argon2id with params from env (memoryCost, timeCost, parallelism; defaults per OWASP), `needsRehash` on login.
  - Dummy-hash verification for unknown users so timing is the same.
- [ ] `TokenService`:
  - Access JWT HS256 (`sub`, `roles`, `sid`, `iat`, `exp`; TTL from env, default 15 min; `iss`/`aud` checked).
  - Refresh token: 32 random bytes, base64url, sha256 hash stored.
- [ ] `AuthService`:
  - `login` (status check, lockout check, verify, create session family).
  - `refresh` (find by hash → if revoked, revoke the family and return 401 → else rotate with sliding expiry capped by `familyExpiresAt`).
  - `logout` (revoke the current session), `me`.
- [ ] Lockout:
  - `failedLoginCount` ≥ N (env, default 5) → `lockedUntil = now + base * 2^(count-N)`, capped (default 60 s base, 15 min cap).
  - Reset on success. Never permanent.
- [ ] Per-IP throttle on `POST /auth/login` (stricter named throttler, from env).
- [ ] `JwtAuthGuard`:
  - Global, inside `@module:auth`.
  - Validates the JWT, then checks that the session `sid` is not revoked (via the repository, with a short in-process cache: `ponytail:` per-instance cache, Redis when horizontal).
  - `@Public()` opts out.
- [ ] `RolesGuard` + `@Roles(...)`. Health endpoints are marked `@Public()`.
- [ ] Endpoints (bodies validated by contracts):
  - `POST /api/v1/auth/login` → `{accessToken, refreshToken, expiresIn}`.
  - `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`.
  - `GET /api/v1/users` (admin; paginated + filtered: email contains, role eq, status eq).
- [ ] `seed:admin` command (reads `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` or prompts). Idempotent.
- [ ] Session cleanup: `deleteExpired` scheduled through a simple interval or an explicit script (documented).
- [ ] Env fragment `auth.env.ts`; `.env.example` entries inside markers.
- [ ] Add `@module:auth` markers everywhere the module touches shared files.

## Deliverables

`apps/api/src/modules/auth/**`, auth e2e tests for both engines, `seed:admin` script, env fragment.

## Acceptance criteria

### Functional

- **AC-M06.1** Valid credentials return 200 with tokens. `me` with the access token returns `MeResponse` (no passwordHash or lockout fields).
- **AC-M06.2** Refresh returns a new pair, and the old refresh token stops working.
- **AC-M06.3** **Reuse detection:** replaying an already-rotated refresh token returns 401 **and** revokes every session in that family. A subsequent refresh with the newest token also returns 401.
- **AC-M06.4** Logout revokes the session. An access token whose `sid` is revoked is rejected (401) within the cache TTL (≤ 30 s, configurable; tested with cache TTL 0).
- **AC-M06.5** Sliding expiry extends `expiresAt` but never past `familyExpiresAt` (tested with fake timers).
- **AC-M06.6** Two logins create two independent families. Logging out one keeps the other valid.
- **AC-M06.7** `GET /users` as admin returns a paginated list with working filters. As a user it returns 403; without a token it returns 401.
- **AC-M06.8** `seed:admin` run twice creates one admin and does not change the password on the second run.

### Security

- **AC-M06.9** Lockout ladder: after 5 failures the next attempt returns 401 locked, even with the correct password. Locks progress 60 s → 120 s → 240 s … capped at 15 min (fake timers). A success resets the counter.
- **AC-M06.10** Unknown email and wrong password return an **identical** status, body and code. A test asserts that the dummy-hash path runs, so timing is comparable.
- **AC-M06.11** Per-IP login throttle returns 429 after the configured limit, independent of account.
- **AC-M06.12** Passwords are stored only as argon2id hashes (`$argon2id$` prefix). Refresh tokens are stored only as sha256 hex (tests read the DB).
- **AC-M06.13** JWT with wrong `iss`/`aud`, `alg: none`, an expired token or a bad signature → 401.
- **AC-M06.14** Every endpoint is protected by default. A test enumerates routes and checks that only those marked `@Public()` (health, login, refresh, docs) skip auth.
- **AC-M06.15** Logs for login attempts contain `userId` or a hashed email, never the raw password or token.

### Module-awareness

- **AC-M06.16** All functional and security ACs pass with `DB=mongo` **and** `DB=postgres`.
- **AC-M06.17** Removing the `auth` marker regions and the `modules/auth` folder still yields a green build and the health e2e (manual here, automated in M11).

### Quality

- **AC-M06.18** Coverage ≥ 90% lines on `modules/auth/**` (security-critical). Lint 0, strict typecheck.

### Docs

- **AC-M06.19** ADR-0006 "Auth: JWT access + rotating refresh families, Argon2id, progressive lockout" is written. `apps/api/AGENTS.md` has an "Auth module" section, including how to mark a route public or role-restricted.

## Verification

```bash
DB=mongo pnpm --filter api test:e2e -- auth
DB=postgres pnpm --filter api test:e2e -- auth
pnpm --filter api test -- --coverage modules/auth
pnpm --filter api seed:admin && pnpm --filter api seed:admin
```

## ADRs produced

- ADR-0006 Auth design (token model, session families, lockout, RBAC, revocation cache).

## Risks & mitigations

| Risk                                                                      | Mitigation                                                                                               |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| argon2 native build on Alpine/Windows                                     | Add to `onlyBuiltDependencies`; verify in Docker (M12) and on Windows.                                   |
| Revocation check on every request adds DB load                            | Short TTL in-process cache; documented upgrade path to Redis.                                            |
| Refresh race (two tabs refreshing at once) triggers false reuse detection | Short grace window (≤ 10 s, env) where the immediately previous token returns the same new pair; tested. |
| Lockout used as a DoS against a known email                               | Temporary progressive lock with a cap; per-IP throttle; documented trade-off.                            |

## Definition of Done

All ACs pass on both engines, ADR-0006 is merged, the commit is made and the status is set to Done.
