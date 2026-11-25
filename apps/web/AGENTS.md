# apps/web

Next.js 16 (App Router, RSC) web app, the BFF for the optional `auth` module
(see "Auth (BFF)"). It has validated server-only env, a typed server API client built on `@repo/contracts`, uniform error
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
- Unknown URLs render `app/global-not-found.tsx` per request (ƒ), so they get
  the nonce (ADR-0010). Do not replace it with a catch-all route (`typedRoutes` would
  accept any href) or make `not-found.tsx` dynamic (every page turns ƒ).
- A client component that imports `@repo/contracts` must import
  `lib/zod-jitless` first, or Zod probes `eval` and the CSP reports it.
- `connect-src 'self'`: the browser never calls the API directly — all API
  traffic is server-side through `api-client.server.ts`.
- A new STATIC page must be added to the exclusion list in `src/proxy.ts`
  `config.matcher` (like `about`); otherwise the proxy gives it a
  nonce and it silently becomes dynamic. Confirm with the `next build` route
  table (○). A dynamic page gets the nonce automatically.

## Auth (BFF)

`@module:auth`, see ADR-0009. Tokens exist only inside the encrypted session
cookie; they never reach a response body or the RSC payload.

| Concern                             | Where                                         |
| ----------------------------------- | --------------------------------------------- |
| Cookie encrypt / decrypt / rotation | `src/lib/session.ts`                          |
| CSRF check (`withCsrf`)             | `src/lib/csrf.ts`                             |
| `next` parameter sanitizer          | `src/lib/safe-redirect.ts`                    |
| Route protection + token refresh    | `src/lib/auth-proxy.ts` (from `src/proxy.ts`) |
| Login / logout handlers             | `src/app/api/auth/{login,logout}/route.ts`    |
| Pages                               | `src/app/(auth)/login`, `(app)/dashboard`     |

Env: `APP_ORIGIN`, `SESSION_SECRET` (required, also at `next build`),
`SESSION_SECRET_PREVIOUS`, `SESSION_MAX_AGE_SECONDS`,
`SESSION_REFRESH_SKEW_SECONDS` (see `.env.example`).

### Add a protected page

1. Create it under `src/app/(app)/<segment>/page.tsx`.
2. Add `/<segment>` to `PROTECTED_PREFIXES` in `src/lib/auth-proxy.ts`. Route
   groups do not appear in URLs, so the group alone protects nothing.
3. Check the session in the page too (`readSession()`, then `redirect`): the
   proxy skips prefetch requests.
4. Call the api with `apiGet(path, schema, { token: session.accessToken })` and
   render only non-secret fields.

### Add a mutating handler

1. Export it wrapped: `export const POST = withCsrf(handler);` (same for PUT,
   PATCH and DELETE).
2. Add the route file to the registry in `src/app/api/auth/handlers.test.ts`;
   the test fails for an unlisted file.
3. Validate the body with a `@repo/contracts` schema before calling the api.
4. Server Actions do not use `withCsrf`: Next checks their origin.

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
pnpm test:e2e:web                # root: build api + deps, then Playwright on the production build (headless)
pnpm test:e2e:web:ui             # root: same, in Playwright UI mode for local debugging
```

## Writing E2E tests

- Specs live in `e2e/auth/` (auth project only), `e2e/no-auth/` (no-auth project only) and `e2e/shared/` (both). `playwright.config.ts` picks exactly one project by whether `src/app/(auth)` exists, so a spec in the wrong folder never runs in the wrong project.
- `auth/` is removed when the auth module is pruned. `shared/` and `fixtures.ts` must never import from `auth/`.
- Import `test` and `expect` from `../fixtures` (not from `@playwright/test`). The auto `violations` fixture fails any test that causes a CSP violation or an uncaught page error.
- Each test creates its own user with `createUser()` from `e2e/auth/users.ts` (runs the built `seed:admin`). Never share users between tests; tests must not depend on order.
- Use `login(page, email, password)` and `GENERIC_ERROR` from `auth/users.ts` for the login form.
- Web-first assertions only (`expect(locator).toBeVisible()`, `toHaveURL`). No `waitForTimeout`, `test.only` or `test.skip` (ESLint blocks the last two).
- Env (ports, secrets, lockout threshold) lives in `e2e/env.ts`. The api and web servers are started by Playwright's `webServer`; never start them by hand.
- Debug a failing test with `pnpm test:e2e:web:ui`. Failures keep a trace, screenshot and video in `apps/web/test-results/` (gitignored); open a trace with `pnpm exec playwright show-trace <trace.zip>`.
- Firefox and WebKit are optional and not configured; the matrix is Chromium only (M10 scope).
- One-time setup on a new machine: `pnpm --filter web exec playwright install chromium`.
- The api side uses `apps/api/scripts/e2e-server.mjs` (MongoDB memory server). A Postgres project needs its own bootstrap there.

## Gates

- 0 lint warnings (next + react-hooks rules), strict typecheck, no `any`.
- Coverage ≥ 80% (lines/statements/functions/branches) on `src/lib/**`.
- Build output: static pages stay ○, `/` is ƒ by design.

## Decisions

- CSP strategy for static vs dynamic routes: `docs/adr/0008-csp-static-vs-dynamic-routes.md`
  (written after M08; `src/lib/csp.ts` and `src/proxy.ts` carry the short
  version).
