# M15 — AI and human documentation

| Field      | Value                                                               |
| ---------- | ------------------------------------------------------------------- |
| Status     | Not started (docs grow in every milestone; this one finalizes them) |
| Depends on | M01–M14                                                             |
| PRD refs   | §8 fork model, NFR-MAINT-3, NFR-DX-1, NFR-DX-2, NFR-SEC-6           |
| Axes       | 8 (Documentation for AI), cross-cutting                             |

## Goal

Documentation complete enough that a fresh AI agent or a new developer can understand, run, extend, scaffold and update a project from this boilerplate **using only the repo docs**.

## Scope

AGENTS.md (root + per app/package), CLAUDE.md, README, ARCHITECTURE, DEVELOPMENT-RULES, FORKING, SECURITY, CHANGELOG, ADR index, and a consistency pass.

## Out of scope

- A docs website; API reference beyond the generated OpenAPI.

## Tasks

- [ ] `AGENTS.md` (canonical, tool-agnostic, ≤ ~200 lines):
  - What this repo is; the "base stays generic" rule.
  - Commands; layout map; contract-first flow; module markers and `modules:*` scripts.
  - Quality gates; ADR rule (when to write one; never rewrite, supersede); links.
- [ ] `CLAUDE.md` = `@AGENTS.md` (+ Claude-specific skill pointers only).
- [ ] Per-workspace `AGENTS.md` (api, web, contracts, ui): only local conventions, linking back to the root.
- [ ] `README.md`: what/why, prerequisites, quick start, Docker, module selection, scripts table, links.
- [ ] `docs/ARCHITECTURE.md`: diagram, request flow (browser → BFF → api → port → adapter), auth flow sequence, module system, where things live.
- [ ] `docs/DEVELOPMENT-RULES.md`: do/don't per area (api, web, contracts, ui, db, security, tests, docs, deps).
- [ ] `docs/FORKING.md`:
  - New-project flow (clone, not fork; remove `.git`; init; `/scaffold`; customize env/branding/deploy; ADR with versions).
  - Updating a child from the base: selective merge vs re-scaffold; the 4 propagation categories with examples; `boilerplate.version`; how to read the CHANGELOG tags.
  - Renovate/platform-config in children.
- [ ] `CHANGELOG.md` format with category tags `[security] [tooling] [architecture] [base-feature]`.
- [ ] `docs/adr/README.md` index (number, title, status, date). Check that ADRs 0001–0013 exist and none was rewritten (git history).
- [ ] Consistency checks:
  - Markdown link checker (lychee or markdown-link-check) in CI quality.
  - Commands mentioned in the docs exist in package.json scripts (small script).

## Deliverables

All listed docs; `scripts/docs-check.mjs`; link-check step in CI.

## Acceptance criteria

### Completeness

- **AC-M15.1** Every file listed in the PRD §4.1 AI docs exists and is non-empty.
- **AC-M15.2** The ADR index lists every ADR. Each has a status, and superseded ones link to their replacement.
- **AC-M15.3** Every PRD decision has an ADR or a doc section (traceability table at the end of `docs/ARCHITECTURE.md`).

### Correctness

- **AC-M15.4** Link check passes (internal links and anchors).
- **AC-M15.5** Every `pnpm <script>` mentioned in the docs exists (docs-check script).
- **AC-M15.6** Every env var in `.env.example` files is documented, and every documented var exists in an env schema.

### Usability (agent test)

- **AC-M15.7** A fresh agent session, given only "read AGENTS.md and add a `GET /api/v1/widgets` endpoint with pagination", produces a change that follows contract-first and DB-port rules and passes gates without extra guidance.
- **AC-M15.8** A fresh agent session, given "start a new project from this boilerplate with postgres and no auth", completes the scaffold round-trip using only docs and skills (same as M16 AC).

### Quality

- **AC-M15.9** Root AGENTS.md ≤ ~200 lines. No duplicated rules between the root and app AGENTS.md (apps link instead).
- **AC-M15.10** Docs contain no secrets, no personal paths and no tool-state references (.omc, .recall…).

### Docs

- **AC-M15.11** `FORKING.md` includes the 4 propagation categories, each with at least one concrete example.

## Verification

```bash
pnpm docs:check          # links + scripts + env vars
wc -l AGENTS.md
# Run the agent tests in AC-M15.7/8 in a clean clone and record the results in docs/perf or the PR description
```

## ADRs produced

None new. Backfill any decision found without an ADR (numbered after 0013).

## Risks & mitigations

| Risk                | Mitigation                                                                        |
| ------------------- | --------------------------------------------------------------------------------- |
| Docs drift after v1 | docs-check in CI; documentation policy in AGENTS.md (update docs in the same PR). |
| AGENTS.md bloat     | Line budget + link-out rule.                                                      |

## Definition of Done

All ACs pass, the commit is made and the status is set to Done.
