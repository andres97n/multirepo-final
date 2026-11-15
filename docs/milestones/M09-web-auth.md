# M09 — Web auth (BFF)

| Field      | Value                                              |
| ---------- | -------------------------------------------------- |
| Status     | Not started                                        |
| Depends on | [M06](./M06-auth-api.md), [M08](./M08-web-core.md) |
| PRD refs   | FR-2.8, FR-2.10, FR-4.3, NFR-SEC-3, NFR-SEC-7      |
| Axes       | 1 (Modular), 2 (Contracts), 5 (Security)           |

## Goal

The web app acts as a Backend-for-Frontend for the `auth` module. Tokens live only in an encrypted httpOnly cookie, routes are protected and refreshed in `proxy.ts`, and every cookie-authenticated mutation is CSRF-protected. Everything lives inside `@module:auth` markers.

## Scope

`lib/session.ts`, `lib/csrf.ts`, route handlers `app/api/auth/{login,logout}`, `proxy.ts` protection + refresh, `(auth)/login` page, `(app)/dashboard` page, logout button.

## Out of scope

- Registration, password reset, OAuth (future modules).

## Tasks

- [ ] `lib/session.ts`:
  - jose `EncryptJWT` (`dir` + `A256GCM`) holding `{ accessToken, refreshToken, accessExp }`.
  - Key from `SESSION_SECRET` (≥ 32 bytes); supports `SESSION_SECRET_PREVIOUS` for rotation (decrypt with either, encrypt with the current one).
  - Cookie: name `__Host-session` in production, httpOnly, Secure in production, `SameSite=Lax`, `Path=/`, max-age = refresh lifetime.
- [ ] `lib/csrf.ts`:
  - `assertSameOrigin(request)` checks `Origin` (falling back to `Referer`) against `APP_ORIGIN`, plus `Sec-Fetch-Site` ∈ {same-origin, none}. Rejects with 403 otherwise.
  - Applied in **every** mutating route handler (wrapper `withCsrf(handler)`).
  - Server Actions rely on Next's built-in origin check, plus `serverActions.allowedOrigins` configured; documented.
- [ ] `POST /api/auth/login`: validates `LoginInput` (contracts), calls the api, sets the cookie, returns `{ ok }`. Never returns tokens to the browser.
- [ ] `POST /api/auth/logout`: calls api logout (best effort) and always clears the cookie.
- [ ] `proxy.ts`:
  - `(app)/*` without a valid session → redirect `/login?next=<path>`.
  - Access token expiring within the skew (env, default 60 s) → refresh via api, rewrite the cookie.
  - Refresh failure → clear the cookie and redirect.
- [ ] `next` param sanitizer: only same-origin relative paths starting with a single `/`. Rejects `//`, `/\`, absolute URLs and `javascript:`.
- [ ] Login page: form with `@repo/ui` FormField, validated by `LoginInput` on the client (UX) and in the handler (trust boundary); generic error message; disabled state while submitting.
- [ ] Dashboard (RSC): reads the session server-side, calls `/auth/me` via `api-client.server`, shows the user and a logout button.
- [ ] `@module:auth` markers in proxy, layout navigation, env schema and `.env.example`.

## Deliverables

`apps/web/src/lib/{session,csrf,safe-redirect}.ts`, `app/api/auth/**`, `app/(auth)/login/**`, `app/(app)/dashboard/**`, proxy updates, tests.

## Acceptance criteria

### Functional

- **AC-M09.1** Login with valid credentials sets the cookie and redirects to `next` or `/dashboard`. Invalid credentials show a generic error and set no cookie.
- **AC-M09.2** Visiting `/dashboard` without a session redirects to `/login?next=%2Fdashboard`.
- **AC-M09.3** When the access token expires, the next navigation transparently refreshes (cookie rewritten, page renders) without a visible redirect.
- **AC-M09.4** When refresh fails (revoked family), the cookie is cleared and the user is redirected to login.
- **AC-M09.5** Logout clears the cookie, revokes the api session, and `/dashboard` redirects again.
- **AC-M09.6** The dashboard shows `me` data fetched server-side.

### Security

- **AC-M09.7** Cookie attributes are asserted in tests: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` + `__Host-` prefix in production mode.
- **AC-M09.8** A tampered, truncated or wrong-key cookie is treated as no session (no 500). A cookie encrypted with `SESSION_SECRET_PREVIOUS` still decrypts.
- **AC-M09.9** A POST to `/api/auth/login` or `/api/auth/logout` with a foreign `Origin` or `Sec-Fetch-Site: cross-site` returns 403. A test exists for **each** mutating handler (a registry test enumerates handlers and fails if any lacks `withCsrf`).
- **AC-M09.10** `next=//evil.com`, `next=https://evil.com`, `next=/\evil.com` and `next=javascript:alert(1)` all redirect to `/dashboard`.
- **AC-M09.11** No token ever reaches the browser: response bodies of the auth handlers contain no `accessToken`/`refreshToken`, and the RSC payload does not include them (test greps the rendered HTML and flight data).
- **AC-M09.12** The login handler rejects bodies that fail `LoginInput` with 400 before calling the api.

### Module-awareness

- **AC-M09.13** With the `auth` markers and folders removed, the web app builds and serves `/` with no references to session or login (manual here, automated in M11).

### Quality

- **AC-M09.14** Coverage ≥ 90% on `lib/{session,csrf,safe-redirect}.ts`. Lint 0, strict typecheck.

### Docs

- **AC-M09.15** ADR-0009 "BFF session cookie, CSRF strategy and key rotation" is written. `apps/web/AGENTS.md` has an "Auth (BFF)" section: how to add a protected page and how to add a mutating handler (must use `withCsrf`).

## Verification

```bash
pnpm --filter web test -- session csrf safe-redirect handlers
pnpm dev   # manual: login -> dashboard -> wait for expiry -> navigate -> logout
curl -i -X POST -H "Origin: https://evil.com" localhost:3000/api/auth/logout   # 403
```

## ADRs produced

- ADR-0009 BFF session (jose JWE cookie), CSRF via Origin/Sec-Fetch-Site, secret rotation.

## Risks & mitigations

| Risk                                       | Mitigation                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Cookie size limit (~4 KB) with two tokens  | Opaque refresh + compact JWT; test asserts the cookie stays < 3.5 KB.                      |
| Parallel requests refresh at the same time | Api grace window (M06); proxy refreshes only on navigation requests, not on static assets. |
| Older browsers without `Sec-Fetch-Site`    | The Origin check is primary; Sec-Fetch-Site is an additional check, not a requirement.     |

## Definition of Done

All ACs pass, ADR-0009 is merged, the commit is made and the status is set to Done.
