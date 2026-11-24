# M08 — Web core

| Field      | Value                                                                    |
| ---------- | ------------------------------------------------------------------------ |
| Status     | Done                                                                     |
| Depends on | [M03](./M03-api-core.md), [M07](./M07-ui-package.md)                     |
| PRD refs   | FR-4.3, NFR-SEC-1, NFR-SEC-2, NFR-SEC-3, NFR-SEC-7, NFR-QUAL-1, NFR-DX-1 |
| Axes       | 2 (Contracts), 5 (Security), 7 (Observability)                           |

## Goal

A Next.js 16 App Router app with no auth. It has validated server-only env, a typed server API client built on contracts, solid error handling, a health route, security headers and a tested CSP strategy that does not force static routes to render dynamically.

## Scope

`apps/web` bootstrap, `lib/env.ts`, `lib/api-client.server.ts`, layouts, home page, error pages, `/api/health`, `proxy.ts` (headers + CSP only at this point), `next.config`.

## Out of scope

- Login, session, CSRF (M09), Playwright (M10), TanStack Query / next-intl (documented as optional).

## Tasks

- [x] Next 16 app: `typedRoutes`, `output: 'standalone'`, `poweredByHeader: false`, React strict mode.
- [x] `lib/env.ts`:
  - Zod schema, imported with `server-only`.
  - Fails `next build` and boot when invalid.
  - No `NEXT_PUBLIC_*` unless explicitly justified (rule written in AGENTS.md).
- [x] `lib/api-client.server.ts`:
  - `apiGet/apiPost(path, schema)` built on `fetch`, with base URL from env and timeout via `AbortSignal.timeout`.
  - Parses success with the contract schema and maps `ErrorEnvelope` → typed `ApiError`.
  - Forwards or creates `x-request-id`.
- [x] Layouts: root layout (tokens, theme script, font), `(public)` group with a home page that shows api health via an RSC fetch.
- [x] `error.tsx`, `global-error.tsx`, `not-found.tsx`; errors show the `requestId` for support and never the stack.
- [x] `app/api/health/route.ts`: web liveness, plus `?deep=1` to check api reachability.
- [x] Security headers (in `next.config` headers for static and in `proxy.ts` for dynamic):
  - HSTS (production only), `Referrer-Policy: strict-origin-when-cross-origin`.
  - `Permissions-Policy` (camera, microphone, geolocation off), `X-Content-Type-Options: nosniff`, `frame-ancestors 'none'`.
- [x] CSP strategy (`lib/csp.ts`, recorded in ADR-0008):
  - **Dynamic routes:** per-request nonce generated in `proxy.ts`; `script-src 'self' 'nonce-…' 'strict-dynamic'`; no `unsafe-eval` in production.
  - **Static routes:** stay static; a nonce-less policy delivered via `next.config` headers (hashes/SRI where Next supports it; otherwise the documented weaker `script-src` limited to `'self'` with the trade-off explained).
  - `connect-src` limited to self (the browser never calls the api directly).
  - `report-uri`/`report-to` optional via env.
- [x] Vitest (node + jsdom projects) for lib and components.
- [x] `apps/web/.env.example`, `apps/web/AGENTS.md`.

## Deliverables

`apps/web/src/{app/**,lib/{env,api-client.server,csp}.ts,proxy.ts}`, `next.config.ts`, tests, `.env.example`, `AGENTS.md`.

## Acceptance criteria

### Functional

- **AC-M08.1** `pnpm dev` serves `/`, which shows api health status fetched server-side (no client fetch to the api).
- **AC-M08.2** `/api/health` returns 200 `Health`. `?deep=1` returns 503 when the api is down.
- **AC-M08.3** An api error renders `error.tsx` with the `requestId` visible. An unknown route renders `not-found.tsx` with status 404.
- **AC-M08.4** `api-client.server` throws a typed `ApiError` with `code` and `requestId` when the api returns an envelope error, and throws a timeout error after the configured ms.
- **AC-M08.5** The `x-request-id` received by the api equals the one generated or forwarded by web (integration test with a mock api).

### Security

- **AC-M08.6** Invalid or missing env makes `next build` fail with the variable name.
- **AC-M08.7** `lib/env.ts` cannot be imported from a client component (`server-only` causes a build error; a test fixture proves it).
- **AC-M08.8** Header tests on a **static** route and a **dynamic** route assert: CSP present, `frame-ancestors 'none'`, `nosniff`, Referrer-Policy, Permissions-Policy, HSTS only in production, no `x-powered-by`.
- **AC-M08.9** On a dynamic route, the CSP nonce differs per request and matches the nonce on rendered `<script>` tags. Production CSP contains no `unsafe-eval`.
- **AC-M08.10** `next build` output still lists the home page and other static routes as static (○), so CSP did not force dynamic rendering.

### Quality

- **AC-M08.11** Lint 0 (next + react-hooks rules), strict typecheck, coverage ≥ 80% on `lib/`.
- **AC-M08.12** Client bundle contains no server-only modules. A build check looks for the env schema string in `.next/static`.

### Docs

- **AC-M08.13** ADR-0008 "CSP strategy for static vs dynamic routes" is written. `apps/web/AGENTS.md` covers server-first fetching and the env rule, and lists TanStack Query and next-intl as documented optional integrations with when to add them.

## Verification

```bash
pnpm --filter web build    # static routes still ○
pnpm --filter web test
pnpm --filter web start & curl -sI localhost:3000/ | grep -i -E "content-security|strict-transport|frame|nosniff"
curl -sI localhost:3000/some-dynamic-route   # nonce differs between two calls
```

## ADRs produced

- ADR-0008 CSP and security headers: nonce for dynamic routes, nonce-less for static routes.

## Risks & mitigations

| Risk                                                                    | Mitigation                                                                                                              |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Next inline scripts need `unsafe-inline` without nonces on static pages | Evaluate SRI/hash support in the pinned Next version; document the residual risk in ADR-0008; revisit on Next upgrades. |
| `proxy.ts` API changes across Next minors                               | Pin Next exact; Renovate group with web tests.                                                                          |
| Theme script blocked by CSP                                             | Give the theme script a nonce/hash, or use a CSS-only theme approach.                                                   |

## Definition of Done

All ACs pass, ADR-0008 is merged, the commit is made and the status is set to Done.
