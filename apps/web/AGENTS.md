# apps/web

Next.js 16 (App Router, RSC) web app. No auth yet; it has validated server-only
env, a typed server API client built on `@repo/contracts`, uniform error
handling, a health route, security headers and a tested CSP strategy that keeps
static routes static.

## Folder roles

- `src/lib/env.schema.ts` — Zod env schema + pure `parseEnv` (NO `server-only`:
  `next.config.ts` imports it to fail builds with variable names).
- `src/lib/env.ts` — `server-only` wrapper; exports the parsed `env`. Never
  importable from a client component.
- `src/lib/api-client.server.ts` — `apiGet`/`apiPost` on `fetch`, contract
  schema validation, `ApiError`/`ApiTimeoutError`, request-id forwarding.
- `src/lib/csp.ts` — pure CSP + security-header builders (shared by
  `next.config.ts` and `src/proxy.ts`).
- `src/lib/request-id.ts` — client-safe request-id helpers and the
  ` [requestId:<id>]` message-suffix regex used by `error.tsx`.
- `src/proxy.ts` — dynamic routes only: per-request CSP nonce, `x-request-id`,
  security headers. Static routes are excluded via the matcher.
- `src/app/` — routes; `src/app/api/health/route.ts` is the web health
  endpoint. `scripts/check-bundle.mjs` proves no server module leaks into
  `.next/static` (AC-M08.12).

## Header / CSP file map

| Concern                               | Where                                             |
| ------------------------------------- | ------------------------------------------------- |
| Static-route CSP (nonce-less)         | `next.config.ts` `headers()` via `src/lib/csp.ts` |
| Dynamic-route CSP (per-request nonce) | `src/proxy.ts` via `src/lib/csp.ts`               |
| HSTS / Referrer-Policy / nosniff / …  | `src/lib/csp.ts` `securityHeaders()` (both paths) |
| CSP rules + report-uri                | `src/lib/csp.ts` `buildCsp()`, `CSP_REPORT_URI`   |

Rules:

- Dynamic routes: `script-src 'self' 'nonce-…' 'strict-dynamic'` — the nonce is
  generated in `src/proxy.ts` and applied by Next to its scripts. No
  `unsafe-eval` in production (development only).
- Static routes stay static (○). They get the nonce-less policy with the
  documented `script-src 'self' 'unsafe-inline'` fallback (Next emits inline
  scripts on prerendered pages; see `src/lib/csp.ts` and ADR-0008).
- `connect-src 'self'`: the browser never calls the API directly — all API
  traffic is server-side through `api-client.server.ts`.
- A new STATIC page must be added to the exclusion list in `src/proxy.ts`
  `config.matcher` (like `about`, `_not-found`); otherwise the proxy gives it a
  nonce and it silently becomes dynamic. Confirm with the `next build` route
  table (○). A dynamic page gets the nonce automatically.

## Env rule

Env is validated with Zod at boot and at `next build` (invalid variables fail
with their names). Server-side only: **no `NEXT_PUBLIC_*` variables** — a
browser-exposed variable needs an explicit justification in an ADR first. Keep
`src/lib/env.schema.ts` free of `server-only` (the build config imports it) and
read values only through `src/lib/env.ts`.

## Server-first fetching

Data fetching happens in Server Components / route handlers through
`apiGet`/`apiPost` (`cache: 'no-store'` by default). Never `fetch` the API from
a client component: CSP (`connect-src 'self'`) blocks it and it would leak
routing concerns to the browser. Pass a contract schema from `@repo/contracts`
— never redefine an HTTP shape here (contract-first rule).

## How to add a page

1. Create `src/app/<segment>/page.tsx` (add a `layout.tsx` only if the segment
   needs shared chrome).
2. Fetch data server-side with `apiGet` + a contract schema; render with
   `@repo/ui` primitives.
3. No data fetching and no dynamic APIs → the page stays static (○). Any
   request-time access (`headers()`, `cookies()`, `cache: 'no-store'` fetch)
   makes it dynamic (ƒ) and the nonce applies.
4. Add tests (jsdom project) with an axe check.

## Optional integrations (documented, not installed)

- **TanStack Query** — add when client components need cached/mutating server
  state (forms, live tables). Not needed while all fetching is server-side.
- **next-intl** — add when the app needs more than one locale. Introduce it
  before translated copy accumulates, not after.

## Commands

```bash
pnpm --filter web dev            # next dev (do not run from agents)
pnpm --filter web build          # next build (static routes must stay ○)
pnpm --filter web start          # next start
pnpm --filter web lint           # eslint, 0 warnings
pnpm --filter web typecheck      # strict tsc --noEmit
pnpm --filter web test           # vitest run (node + jsdom projects)
pnpm --filter web test:coverage  # + v8 coverage (>= 80% on src/lib)
pnpm --filter web check:bundle   # after build: no server modules in .next/static
```

## Gates

- 0 lint warnings (next + react-hooks rules), strict typecheck, no `any`.
- Coverage ≥ 80% (lines/statements/functions/branches) on `src/lib/**`.
- Build output: static pages stay ○, `/` is ƒ by design.

## Decisions

- CSP strategy for static vs dynamic routes: `docs/adr/0008-csp-static-vs-dynamic-routes.md`
  (written after M08; `src/lib/csp.ts` and `src/proxy.ts` carry the short
  version).
