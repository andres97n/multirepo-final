# ADR-0009 — BFF session cookie, CSRF strategy and key rotation

- Status: Accepted
- Date: 2026-11-24
- Supersedes: — / Superseded-by: —

## Context

The api issues a short-lived access JWT and a rotating opaque refresh token
(ADR-0006). The browser must never hold either one, the web app must keep
working without a session store of its own, and cookie authentication opens the
door to CSRF. The whole feature has to be removable (`@module:auth`).

## Decision

1. **Stateless encrypted cookie.** `lib/session.ts` seals
   `{ accessToken, refreshToken, accessExp }` with jose `EncryptJWT`
   (`dir` + `A256GCM`, key = SHA-256 of `SESSION_SECRET`). The cookie is
   `__Host-session` in production (`session` elsewhere), `HttpOnly`,
   `SameSite=Lax`, `Path=/`, `Secure` in production, with
   `Max-Age = SESSION_MAX_AGE_SECONDS` (7 days, the refresh idle TTL). Clearing
   resends the same attributes with `Max-Age=0`. Any cookie that cannot be
   decrypted or validated means "no session".
2. **Key rotation.** `SESSION_SECRET_PREVIOUS` is accepted for decryption only.
   To rotate: move the current value there, set a new `SESSION_SECRET`, and
   remove the previous one after `SESSION_MAX_AGE_SECONDS`. Secrets are at least
   32 bytes, and values containing `example` are rejected in production.
3. **Protection and refresh in `proxy.ts`** (`lib/auth-proxy.ts`). Protected
   prefixes redirect to `/login?next=…` without a session. An access token
   expiring within `SESSION_REFRESH_SKEW_SECONDS` is refreshed and the new
   cookie is written to both the request and the response. Any refresh failure
   clears the cookie. Protected pages check the session again themselves,
   because the proxy matcher skips prefetch requests.
4. **CSRF.** Every mutating route handler is wrapped in `withCsrf`: `Origin`
   (else `Referer`) must equal `APP_ORIGIN`, and `Sec-Fetch-Site`, when sent,
   must be `same-origin` or `none`. A registry test enumerates the handlers
   under `app/api`. Server Actions use Next's own origin check, with
   `serverActions.allowedOrigins` set to the `APP_ORIGIN` host.
5. **Redirect targets.** `next` is accepted only as a same-origin path with a
   single leading `/` and no backslash or control characters.

## Alternatives

- Server-side session store: allows instant revocation from web, but adds
  infrastructure the boilerplate does not otherwise need. Rejected.
- Tokens in `localStorage` or readable cookies: exposed to XSS. Rejected.
- CSRF tokens (double submit): more moving parts than origin checks for a
  same-origin BFF. Rejected.

## Consequences

- No web-side state; revocation is enforced by the api, so a revoked session is
  noticed on the next api call or refresh.
- Parallel refreshes rely on the api grace window (`REFRESH_GRACE_SECONDS`).
- A transient api failure during refresh signs the user out.
- Every api call comes from the web server, so the api's per-IP login throttle
  is shared by all users. Forwarding the client IP needs a `TRUST_PROXY` design
  and is left for a later decision.
- `APP_ORIGIN` and `SESSION_SECRET` are required at `next build` as well as at
  runtime.
