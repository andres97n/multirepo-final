# ADR-0010 — Unmatched URLs render a dynamic `global-not-found`

- Status: Accepted
- Date: 2026-11-24
- Supersedes: — (refines ADR-0008) / Superseded-by: —

## Context

ADR-0008 left `/_not-found` prerendered. For an unknown URL, `proxy.ts` still sends the nonce CSP, but the prerendered scripts carry no nonce, so the browser blocked all of them. The M10 browser suite found this.

## Decision

Enable `experimental.globalNotFound` and render `app/global-not-found.tsx` per request (`connection()`). `/_not-found` leaves the proxy matcher's exclusion list. `not-found.tsx` stays for `notFound()` calls and provides the markup.

## Alternatives

- Dynamic `not-found.tsx`: every page, including `/about`, becomes dynamic.
- Catch-all `[...notFound]` route: `typedRoutes` then accepts any `href`.
- Relaxing the CSP for 404 responses: weakens a secure default.

## Consequences

- Every unknown URL costs one server render.
- The flag is experimental: check it on each Next upgrade. The E2E CSP specs fail if the 404 breaks.
