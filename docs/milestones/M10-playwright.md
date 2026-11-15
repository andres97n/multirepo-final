# M10 — Playwright E2E

| Field      | Value                                               |
| ---------- | --------------------------------------------------- |
| Status     | Not started                                         |
| Depends on | [M09](./M09-web-auth.md)                            |
| PRD refs   | §9 acceptance (2), NFR-QUAL-1, NFR-SEC-3, NFR-SEC-7 |
| Axes       | 4 (Quality & testing)                               |

## Goal

Browser smoke tests run against the **production build** of web plus a running api. The suite adapts to the installed modules: with auth it covers login, protected access and logout; without auth it covers loading and navigation.

## Scope

`apps/web/e2e/**`, `playwright.config.ts`, a test fixture that seeds a user, and scripts to start the stack for E2E.

## Out of scope

- Visual regression, cross-browser matrix beyond Chromium (Firefox/WebKit documented as optional), load testing.

## Tasks

- [ ] `playwright.config.ts`:
  - `webServer` starts `next start` (after `next build`) and the api (built), against a test DB (memory server or compose service).
  - Projects `auth` and `no-auth`. The project is selected by whether `apps/web/src/app/(auth)` exists (or `modules.json` selection after M11).
  - `trace: 'retain-on-failure'`, screenshots and videos on failure; `retries: 2` in CI, 0 locally.
- [ ] Global setup: seed an admin and a normal user through the api seed command or a test-only endpoint guarded by `NODE_ENV=test`.
- [ ] Specs, **auth**:
  - Login success, then dashboard shows the email.
  - Wrong password → generic error.
  - Protected redirect keeps `next`.
  - Logout → protected again.
  - Session cookie not readable from JS.
  - Locked-out user message after N failures (with test env lockout = 2).
- [ ] Specs, **no-auth**: home loads with api health OK; navigation between public pages; 404 page; `/api/health`.
- [ ] Shared specs: CSP header present and no console CSP violations on visited pages; no uncaught page errors.
- [ ] Scripts: `test:e2e:web` (build + run), `test:e2e:web:ui` (local debugging).

## Deliverables

`apps/web/playwright.config.ts`, `apps/web/e2e/{auth,no-auth,shared}/*.spec.ts`, global setup, scripts.

## Acceptance criteria

### Functional

- **AC-M10.1** `pnpm test:e2e:web` builds web in production mode and runs the suite headless, exiting 0.
- **AC-M10.2** In the auth project, login → dashboard → logout passes, and a protected route redirects with `next` preserved.
- **AC-M10.3** In the no-auth project (auth pruned), home, navigation, 404 and health pass.
- **AC-M10.4** The suite picks the correct project automatically for the installed modules. Running the wrong one is not possible by default.

### Security

- **AC-M10.5** `document.cookie` in the page does not contain the session cookie (httpOnly verified in a real browser).
- **AC-M10.6** No `securitypolicyviolation` events and no CSP console errors occur on any visited page.
- **AC-M10.7** The lockout message appears after the configured failures, and the error text is identical for an unknown email and a wrong password.

### Quality

- **AC-M10.8** Specs are independent and parallel-safe: each test creates or uses its own user, with no ordering dependence.
- **AC-M10.9** A full local run completes in under 3 minutes on a dev laptop (measured and recorded).
- **AC-M10.10** On failure, a trace and screenshot are produced in `apps/web/test-results/`, which is gitignored.
- **AC-M10.11** No `test.only` or `test.skip` is committed (ESLint `playwright/no-focused-test`, `no-skipped-test`).

### Docs

- **AC-M10.12** `apps/web/AGENTS.md` has a "Writing E2E tests" section: where specs go, how to target auth/no-auth, and how to debug with UI mode.

## Verification

```bash
pnpm test:e2e:web
# after M11: node scripts/modules.mjs apply --without=auth && pnpm i && pnpm test:e2e:web
grep -rn "test.only\|test.skip" apps/web/e2e   # nothing
```

## ADRs produced

None (follows ADR-0006/0009).

## Risks & mitigations

| Risk                                          | Mitigation                                                                                                        |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Flaky tests from timing                       | Use web-first assertions (`expect(locator).toBeVisible`), no manual sleeps, CI retries with trace.                |
| Slow startup (build + api)                    | Reuse builds via turbo cache; `reuseExistingServer` locally.                                                      |
| Test-only seed endpoint leaks into production | Prefer the seed command; if an endpoint is used, it exists only when `NODE_ENV=test`, which a unit test verifies. |

## Definition of Done

All ACs pass for the auth project (and for no-auth with a manual prune). The commit is made and the status is set to Done.
