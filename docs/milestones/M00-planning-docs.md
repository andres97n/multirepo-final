# M00 — Planning docs

| Field      | Value                    |
| ---------- | ------------------------ |
| Status     | Done                     |
| Depends on | —                        |
| PRD refs   | all (defines them)       |
| Axes       | 8 (Documentation for AI) |

## Goal

Write down what the boilerplate is and how it will be built, before any code exists, so every later milestone has a fixed reference.

## Scope

- `docs/prd.md` with stable requirement ids (FR-_, NFR-_).
- `docs/plan.md` (master plan + milestone index).
- `docs/milestones/M00…M16` (one file per milestone, same template).

## Out of scope

- Any code, config, git repo or ADR file (ADRs start in M01).

## Tasks

- [x] Interview the owner (objective, stack, features, security, deploy, data model, acceptance).
- [x] Write `docs/prd.md`.
- [x] Write `docs/plan.md`.
- [x] Split milestones into `docs/milestones/*.md` with acceptance criteria.
- [ ] Owner approval.

## Deliverables

- `docs/prd.md`, `docs/plan.md`, `docs/milestones/M00-…M16-*.md`

## Acceptance criteria

### Functional

- **AC-M00.1** PRD covers objective, users, the 8 axes, scope, out-of-scope, FRs, NFRs, data model, fork model and v1 acceptance.
- **AC-M00.2** Every FR and NFR has a stable id that milestones can cite.
- **AC-M00.3** Every interview decision appears in the PRD or plan (nothing only in chat).
- **AC-M00.4** There is one milestone file per milestone M00–M16, and each uses the template in `plan.md` §5.

### Quality

- **AC-M00.5** Every milestone has testable acceptance criteria (`AC-Mxx.n`) and a Verification section.
- **AC-M00.6** Every FR/NFR id cited in a milestone exists in the PRD.
- **AC-M00.7** Every link in the `plan.md` milestone index resolves.

### Docs

- **AC-M00.8** Open questions and assumptions are listed explicitly (PRD §10).

## Verification

- `grep -c "## Acceptance criteria" docs/milestones/*.md` → 17 files, 1 each.
- `grep -oh "FR-[0-9.]*\|NFR-[A-Z]*-[0-9]*" docs/milestones/*.md | sort -u` → each id is found in `docs/prd.md`.
- Manual read-through by the owner.

## ADRs produced

None (the ADR template is created in M01).

## Risks & mitigations

| Risk                                           | Mitigation                                                                                     |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Plan drifts from reality during implementation | Update the milestone file in the same commit as the change; architectural changes need an ADR. |

## Definition of Done

All ACs pass and the owner has approved.
