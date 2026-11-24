# ADR-0008 — CSP and security headers: nonce for dynamic routes, nonce-less for static routes

- Status: Accepted
- Date: 2026-11-23
- Supersedes: — / Superseded-by: —

## Context

`apps/web` needs a tested Content-Security-Policy. A per-request nonce is the
strongest option but forces every route that carries it to render dynamically,
which would turn static pages (○) into dynamic ones. Verified on Next 16.4.6:
prerendered pages still contain inline `<script>` blocks (Turbopack bootstrap
and the RSC flight payload), and Next publishes no CSP hashes for them.

## Decision

1. **Dynamic routes:** `src/proxy.ts` generates a nonce per request and sets
   `script-src 'self' 'nonce-…' 'strict-dynamic'` on request and response, which
   Next applies to its scripts. It also sets `x-request-id` and the shared
   security headers. The matcher skips static assets, prerendered pages and
   `next/link` prefetches.
2. **Static routes:** stay static. `next.config.ts` `headers()` delivers a
   nonce-less policy with `script-src 'self' 'unsafe-inline'` (and
   `style-src 'self' 'unsafe-inline'`). `experimental.sri` (sha256) was tried; it
   adds `integrity` to external chunks only, so inline scripts remain.
3. **Both:** `connect-src 'self'` (the browser never calls the api),
   `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`,
   `form-action 'self'`, no `unsafe-eval` in production, `report-uri`
   from `CSP_REPORT_URI`. Other headers: `Referrer-Policy`, `Permissions-Policy`
   (camera, microphone, geolocation off), `nosniff`, `X-Frame-Options: DENY`,
   HSTS in production only. `poweredByHeader: false`.
4. Builders live in `src/lib/csp.ts` and are pure and unit-tested; a live check
   asserts headers and nonce behaviour against a built server.

## Alternatives

- Nonce everywhere: strongest, but every page becomes dynamic. Rejected.
- `script-src 'self'` on static routes: breaks hydration (blocked inline scripts).
- Hashes or SRI for inline scripts: not supported by Next today.

## Consequences

- Static routes carry a residual risk: an HTML-level XSS there can run inline
  script. All data-bearing routes use the strict nonce policy.
- Home (`/`) is dynamic by design (no-store api fetch); `/about` and
  `/_not-found` are static.
- Revisit on Next upgrades (SRI is experimental; hash support would remove
  `unsafe-inline`). Pin Next exactly; `proxy.ts` is the Next 16 name.
