# M14 — Performance budgets

| Field      | Value                                                      |
| ---------- | ---------------------------------------------------------- |
| Status     | Not started                                                |
| Depends on | [M12](./M12-docker.md), [M13](./M13-platform-config-ci.md) |
| PRD refs   | NFR-PERF-1, NFR-PERF-2, NFR-PERF-3, NFR-PERF-4             |
| Axes       | 4 (Quality), 6 (Infra), cross-cutting maintenance          |

## Goal

Measurable, per-project performance budgets enforced in CI: first-load client JS per representative route, Lighthouse scores, and Docker image size. Budgets come from measured baselines and can be tuned per child project but never switched off.

## Scope

`perf-budgets.json` (+ schema), bundle measurement script, `lighthouserc.json`, image-size check, perf workflow wiring, optional api latency script.

## Out of scope

- RUM / production monitoring, api latency in CI (optional script only).

## Tasks

- [ ] **Baseline first:** build production web, measure first-load JS (gzip) for `/`, `/login` and `/dashboard` (auth) or `/` plus one public page (no-auth); run LHCI 3× on each route; read image sizes from M12. Record in `docs/perf/baseline.md` with date and versions.
- [ ] `perf-budgets.json` + `perf-budgets.schema.json`:
  - `routes: { "/": { firstLoadJsKb: n }, … }` (route list required, at least one).
  - `lighthouse: { runs: 3, mode: "warn"|"error", minScores: { performance, accessibility, best-practices } }`.
  - `images: { api: { maxMb }, web: { maxMb } }`.
  - Budgets = baseline + headroom (10%). The schema forbids removing a section or setting a value to 0 or null.
- [ ] `scripts/perf/bundle-check.mjs`:
  - Reads the Next build manifests for the listed routes and computes client JS sent on first load (shared + route chunks, gzip).
  - Does not use the total `.next` size.
  - Prints a table and fails on breach.
- [ ] `lighthouserc.json`: `numberOfRuns: 3`, `aggregationMethod: median-run`, desktop preset + one mobile run on `/`; assertions generated from `perf-budgets.json` with level `warn` initially.
- [ ] Image size check in `docker.yml` reads `perf-budgets.json`.
- [ ] Wire `perf.yml` (platform-config) into the boilerplate CI: bundle check (blocking), LHCI (per `mode`), artifacts uploaded.
- [ ] Calibration procedure (docs): after N=10 green main runs with low variance, switch `lighthouse.mode` to `error`.
- [ ] Optional `pnpm perf:api` (autocannon on `/health/live` and login) that prints p50/p95/p99. Not in CI.

## Deliverables

`perf-budgets.json`, `perf-budgets.schema.json`, `scripts/perf/bundle-check.mjs`, `lighthouserc.json`, `docs/perf/baseline.md`, CI wiring, `scripts/perf/api-latency.mjs`.

## Acceptance criteria

### Functional

- **AC-M14.1** `docs/perf/baseline.md` exists with measured numbers, date, Next/React versions and machine/CI runner type, **before** any budget value is committed.
- **AC-M14.2** `pnpm perf:bundle` prints first-load JS per configured route from the production build and exits 0 within budget.
- **AC-M14.3** Adding a large client dependency to a page (test branch) makes the bundle check fail with route, actual, budget and delta.
- **AC-M14.4** LHCI runs 3 times per route and reports the median. In `warn` mode a score below budget annotates the PR but does not fail; in `error` mode it fails.
- **AC-M14.5** The image-size check fails when an image exceeds `images.*.maxMb`.

### Configurability

- **AC-M14.6** A child can raise a budget (e.g. `firstLoadJsKb: 180`) and CI passes using the new value.
- **AC-M14.7** Removing a section, emptying `routes`, or setting a budget to 0 or null fails schema validation in CI, so checks cannot be disabled through config.
- **AC-M14.8** Representative routes are configurable. Routes removed by `modules:apply` (e.g. `/login`) are pruned from `perf-budgets.json` by the module script.

### Quality

- **AC-M14.9** The bundle-check script has unit tests on fixture manifests (shared chunk counted once; route-specific chunks summed).
- **AC-M14.10** Variance of LHCI performance across 3 runs on CI is documented. Promotion to `error` is a documented, single-line change.

### Docs

- **AC-M14.11** ADR-0013 "Performance budget policy" (baseline first, per-route first-load JS, LHCI warn→block, configurable not disable-able) is written. README has a "Performance budgets" section.

## Verification

```bash
pnpm --filter web build && pnpm perf:bundle
pnpm dlx @lhci/cli autorun     # local LHCI with median of 3
node scripts/modules.mjs check  # perf-budgets routes consistent with modules
pnpm perf:api                   # optional
```

## ADRs produced

- ADR-0013 Performance budget policy.

## Risks & mitigations

| Risk                                          | Mitigation                                                                             |
| --------------------------------------------- | -------------------------------------------------------------------------------------- |
| Next manifest format changes between versions | Script isolated with fixture tests; Renovate Next upgrades run perf CI.                |
| LHCI noise on shared CI runners               | Median of 3, warn mode first, documented calibration; desktop preset reduces variance. |
| Budgets too tight, causing churn              | 10% headroom over baseline; raise via PR with justification in the description.        |

## Definition of Done

All ACs pass, ADR-0013 is merged, the commit is made and the status is set to Done.
