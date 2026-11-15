# M16 — v1 acceptance

| Field      | Value                                  |
| ---------- | -------------------------------------- |
| Status     | Not started                            |
| Depends on | M00–M15                                |
| PRD refs   | §9 acceptance criteria (1–6), all NFRs |
| Axes       | 1–8                                    |

## Goal

Prove the boilerplate meets every v1 acceptance criterion from a clean state, then release `v1.0.0`.

## Scope

Verification runs, a release checklist and the tag. No new features. Defects found here are fixed in the milestone they belong to (its file is updated), then re-verified.

## Out of scope

- New modules, post-v1 integrations.

## Tasks

- [ ] Fresh clone in an empty temp directory, on Windows **and** in Linux CI.
- [ ] Run the PRD §9 checklist (below) and record evidence (command output, CI run links) in `docs/releases/v1.0.0.md`.
- [ ] Agent scaffold round-trip in a clean clone with a fresh agent session.
- [ ] Security review pass: run the `security-review` skill (or the equivalent reviewer) on the full repo; resolve or file exceptions.
- [ ] Over-engineering review: one pass looking for speculative abstractions; remove findings or justify them in an ADR.
- [ ] Bump `boilerplate.version` to `1.0.0`, write the CHANGELOG entry, tag `v1.0.0`.

## Acceptance criteria

### PRD §9.1 — Fresh clone green

- **AC-M16.1** `git clone → pnpm i → cp .env.example .env (per app) → pnpm dev:db → pnpm dev` serves web on :3000 and api on :3001 with no manual steps other than those listed in the README.
- **AC-M16.2** `pnpm lint typecheck test build` exit 0 with zero warnings, on Windows and Linux.

### PRD §9.2 — Module matrix green

- **AC-M16.3** CI matrix {mongo, mongo+auth, postgres, postgres+auth} is green on `main`: lint, typecheck, unit, api e2e, build and Playwright.

### PRD §9.3 — Scaffold round-trip

- **AC-M16.4** A fresh agent with the `scaffold` skill turns a clean clone into postgres without auth. Gates and `modules:check` are green, docs are updated, an ADR is written, and no secret is committed.

### PRD §9.4 — Docker CI-verified

- **AC-M16.5** The CI docker job is green: images built via turbo prune, non-root, healthy in compose, size within `perf-budgets.json`, no CRITICAL vulnerabilities.

### PRD §9.5 — Security controls tested

- **AC-M16.6** Tests exist and pass for: env rejection (M03), redaction (M03), NoSQL/SQL filter injection (M04/M05), lockout and reuse detection (M06), CSRF, cookie flags and open redirect (M09), CSP static/dynamic (M08), httpOnly in a real browser (M10).
- **AC-M16.7** Security CI (gitleaks, CodeQL, audit, dependency-review) is green, and `.security/exceptions.yaml` has no expired entries.

### PRD §9.6 — Docs complete

- **AC-M16.8** M15 acceptance criteria all pass. ADRs 0001–0013 (plus any backfilled) are accepted.

### Performance

- **AC-M16.9** Bundle and image budgets pass. LHCI results are recorded, and their mode (warn/error) matches the calibration status documented in ADR-0013.

### Release

- **AC-M16.10** `docs/releases/v1.0.0.md` contains evidence for every AC above. Tag `v1.0.0` exists, `boilerplate.version` = `1.0.0`, and the CHANGELOG entry is categorized.
- **AC-M16.11** No `TODO`/`FIXME` without an issue link, no `test.only`/`test.skip`, and no placeholder code remain (`grep` check).

## Verification

```bash
git clone <repo> /tmp/v1 && cd /tmp/v1 && pnpm i && pnpm lint typecheck test build
pnpm modules:matrix
pnpm docker:smoke
grep -rnE "TODO|FIXME|test\.(only|skip)" apps packages scripts --include=*.ts --include=*.tsx --include=*.mjs
```

## ADRs produced

None (unless the reviews produce one).

## Risks & mitigations

| Risk                                   | Mitigation                                                                  |
| -------------------------------------- | --------------------------------------------------------------------------- |
| Windows-only or Linux-only failures    | Run both; fix in the owning milestone.                                      |
| Late discovery of an architectural gap | Treat as a blocker; ADR + fix in the owning milestone, never a hack in M16. |

## Definition of Done

All ACs pass with recorded evidence and `v1.0.0` is tagged. The boilerplate is ready to clone for the first real project.
