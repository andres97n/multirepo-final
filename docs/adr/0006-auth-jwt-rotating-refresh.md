# ADR-0006 — Auth: JWT access + rotating refresh families, Argon2id, progressive lockout

- Status: Accepted
- Date: 2026-11-22
- Supersedes: — / Superseded-by: —

## Context

The boilerplate needs local email + password login that is secure by default, removable as a module (`@module:auth`) and identical on Mongo and Postgres. The web BFF (M09) keeps tokens server-side, so the API must be a plain bearer-token service with revocable sessions.

## Decision

1. **Passwords:** Argon2id (`argon2`), parameters from env (OWASP defaults), `needsRehash` upgrade on login. Unknown, disabled and locked accounts run a dummy verify so timing and responses match.
2. **Access token:** HS256 JWT via `@nestjs/jwt`, 15 min, claims `sub`, `roles`, `sid`, `iat`, `exp`; `iss`/`aud` and `algorithms: ['HS256']` enforced on verify (`alg: none` rejected). Outside production a missing `JWT_ACCESS_SECRET` yields a random per-process secret; production requires a strong one.
3. **Refresh token:** 32 random bytes, base64url, stored only as SHA-256 hex. Each login creates a session **family** (`familyId`). Every refresh rotates the token; expiry slides by 7 days but never past the family's 30-day `familyExpiresAt`.
4. **Reuse detection:** presenting a revoked or already-rotated token revokes the whole family and returns 401. Each session keeps every hash it rotated away from (`retiredTokenHashes`), so reuse is detected however many rotations ago the token was retired. Rotation is a compare-and-swap on the presented hash, so of N concurrent refreshes exactly one wins. A short grace window (`REFRESH_GRACE_SECONDS`, default 10, max 10, 0 disables) lets the immediately previous token (only that one) of a concurrent refresh (two tabs) receive a fresh pair instead of triggering revocation.
5. **Revocation:** `JwtAuthGuard` verifies the JWT, then checks the session `sid` through the repository behind a per-instance cache (TTL ≤ 30 s, 0 disables). Logout invalidates the local entry. Redis is the documented upgrade for horizontal scaling.
6. **Lockout:** after `LOCKOUT_THRESHOLD` (5) consecutive failures, `lockedUntil = now + base * 2^(count-threshold)` (60 s base, 15 min cap); reset on success; never permanent. Locked responses are the same 401 as bad credentials. A per-IP named `login` throttler (429) is independent of the account.
7. **RBAC:** roles `user` and `admin`. Global `JwtAuthGuard` then `RolesGuard` (registered via `APP_GUARD` inside `AuthModule`); `@Public()` (in `src/common/`, so health does not import auth) opts out; `@Roles(...)` restricts.
8. **Persistence:** `UsersRepository` / `SessionsRepository` abstract ports with Mongo and Postgres adapters under `modules/auth/{mongo,postgres}` (ESLint overrides allow the drivers there). Atomic operations (`recordFailedLogin`, `rotate`, `revokeFamily`, `deleteExpired`) are implemented per engine; a shared contract suite runs on both.
9. **Cleanup:** an unref'd interval in `AuthModule` calls `deleteExpired` (`SESSION_CLEANUP_INTERVAL_MINUTES`).

## Alternatives

- **Passport:** rejected; plain guards suffice.
- **bcrypt:** rejected in favour of Argon2id.
- **Stateless refresh JWTs:** rejected; no reuse detection or revocation.
- **Permanent lockout:** rejected; it enables account DoS. Progressive capped lock plus per-IP throttle instead.

## Consequences

- Every endpoint is protected unless marked `@Public()`; a test enumerates routes.
- Lockout can still be used to briefly annoy a known email (documented trade-off, capped at 15 min).
- The grace window lets a stolen token that is replayed within 10 s of rotation receive a pair; set `REFRESH_GRACE_SECONDS=0` to disable.
- Revocation takes effect within the cache TTL on other instances.
