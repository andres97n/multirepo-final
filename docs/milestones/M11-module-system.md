# M11 — Module system + agent skills

| Field      | Value                                                                          |
| ---------- | ------------------------------------------------------------------------------ |
| Status     | Done                                                                           |
| Depends on | [M06](./M06-auth-api.md), [M09](./M09-web-auth.md), [M10](./M10-playwright.md) |
| PRD refs   | FR-1.1, FR-1.2, FR-1.3, FR-1.4, §4.2, §9 acceptance (2, 3), NFR-DX-2           |
| Axes       | 1 (Modular), 8 (AI docs)                                                       |

## Goal

Choosing modules becomes deterministic and agent-driven. `modules.json` describes every module, `scripts/modules.mjs` applies or validates a selection, and the `scaffold` and `adr` skills (Claude + OpenCode/OMO) handle the interview, configuration, docs and ADR.

## Scope

Manifest, script, marker conventions, the `scaffold` and `adr` skills, OpenCode/OMO config, a local combo check.

## Out of scope

- CI matrix wiring (M13). Adding new optional modules beyond auth (future; auth is the reference example).

## Tasks

- [x] Marker convention (documented):
  - TS/JS: `// @module:<name>` … `// @end-module:<name>`.
  - YAML/env: `# @module:<name>` … `# @end-module:<name>`.
  - JSON has no comments, so it is handled through `deps` in the manifest.
- [x] `modules.json` (with a JSON Schema file `modules.schema.json`):
  - `name`, `kind` (`core|optional|db`), `group` (`db`), `default` (bool), `description`.
  - `paths[]` (deleted when the module is removed), `markers[]` (files containing its regions).
  - `deps` (`{ "<workspace>": ["pkg", …] }` removed from package.json), `env[]` (variables), `compose[]` (services).
  - `docs[]` (doc sections to update), `requires[]`, `conflicts[]`.
  - Entries: `db-mongo`, `db-postgres`, `auth`.
- [x] `scripts/modules.mjs` (Node stdlib only):
  - `check`: schema-valid; every path exists; every marker region is balanced and named after a known module; no orphan markers; requires/conflicts are acyclic and satisfiable; exactly one `db` group module is default.
  - `apply --db=<mongo|postgres> --without=<a,b>`:
    - Validates the selection, deletes the paths of unselected modules, strips their marker regions, and removes the marker comment lines of kept modules (clean output).
    - Removes deps from package.json, prunes env and compose entries, and rewrites `modules.json` to the selected set.
    - Prints a summary.
  - `apply --dry-run` prints the changes without writing.
  - `list` shows modules with their status.
- [x] Unit tests for the script on a fixture tree (`scripts/__fixtures__`), using `node:test`.
- [x] Root scripts: `modules:check`, `modules:apply`. Add `modules:check` to lint-staged when `modules.json` or a marked file changes.
- [x] `.claude/skills/scaffold/SKILL.md`:
  1. Read `modules.json` and AGENTS.md.
  2. Interview: DB engine, optional modules (keep/remove), mandatory config (app name, ports, origins, secrets generation, seed admin).
  3. Run `apply` (dry-run first, show the diff, confirm).
  4. Generate `.env` files with strong random secrets (never committed).
  5. `pnpm i`, then `lint typecheck test build`.
  6. Update README/AGENTS sections.
  7. Write an ADR (selection + dependency versions).
  8. Report.
- [x] `.claude/skills/adr/SKILL.md`: create the next numbered ADR from the template; to supersede, set the old ADR status to `Superseded by NNNN` and link both ways. Never rewrite an accepted ADR's decision text.
- [x] OpenCode/OMO: AGENTS.md as instructions; skill paths include `.claude/skills` (verify discovery; otherwise configure paths explicitly). Discovery is native, so no `.opencode/` config is needed (ADR-0011 §6).
- [x] Local script `pnpm modules:matrix` that runs the 4 combos in temp copies (git worktree) and runs the gates. It is used before M13 exists.

## Deliverables

`modules.json`, `modules.schema.json`, `scripts/modules.mjs`, script tests, `.claude/skills/{scaffold,adr}/SKILL.md`, `.opencode/**`, root scripts.

## Acceptance criteria

### Functional

- **AC-M11.1** `pnpm modules:check` passes on the base repo.
- **AC-M11.2** `check` fails, with a precise message (file, line, module), on: an unbalanced marker, an unknown module name in a marker, a missing path, `db-mongo` and `db-postgres` both selected, or `auth` selected without a `db` module.
- **AC-M11.3** `apply` for each of the 4 combos (mongo, mongo+auth, postgres, postgres+auth) produces a tree where `pnpm i && pnpm lint typecheck test build` are green, and the matching Playwright project passes.
- **AC-M11.4** `apply` is **idempotent**: running the same selection twice produces no further changes (`git diff` is empty after the second run).
- **AC-M11.5** After `apply`, no marker comments remain for kept modules, there is no reference to removed modules (grep for `auth`, `mongoose` or `drizzle` as appropriate), and no removed deps remain in any package.json or the lockfile.
- **AC-M11.6** `--dry-run` writes nothing (file hashes unchanged).
- **AC-M11.7** `modules.json` after `apply` lists only the selected modules, so `check` still passes.

### Agent skills

- **AC-M11.8** The `scaffold` skill, run by an agent in a fresh clone with the answers "postgres, remove auth", reaches green gates and writes an ADR listing the selection and pinned versions.
- **AC-M11.9** Secrets generated by the skill are ≥ 32 random bytes, are written only to gitignored `.env` files, and are never echoed into docs or the ADR.
- **AC-M11.10** The `adr` skill creates `docs/adr/NNNN-title.md` with the next number. Superseding updates both files' status/links and leaves the original decision text unchanged.
- **AC-M11.11** OpenCode/OMO loads AGENTS.md and can see both skills (verified once and recorded in ADR-0011).

### Quality

- **AC-M11.12** `scripts/modules.mjs` has no npm dependencies, and its tests cover check errors, apply, idempotency and dry-run (≥ 90% lines).

### Docs

- **AC-M11.13** ADR-0011 "Module manifest + marker pruning" is written. AGENTS.md has a "Modules" section: the marker convention and how to add a new optional module using auth as the example (step-by-step checklist).

## Verification

```bash
pnpm modules:check
node --test "scripts/*.test.mjs"
pnpm modules:matrix     # 4 combos green
node scripts/modules.mjs apply --db=postgres --without=auth && node scripts/modules.mjs apply --db=postgres --without=auth && git diff --stat   # idempotent second run
```

### Verification log (2026-11-24)

- `pnpm modules:matrix`: mongo, mongo+auth, postgres, postgres+auth all PASS (install, lint, typecheck, test, build, Playwright `no-auth` 10/10 and `auth` 13/13).
- Idempotency and dry-run were checked on a worktree of the real tree (second `apply` reports 0 actions with an empty `git diff`; dry-run leaves file hashes unchanged). Script tests: 20 pass, 95% line coverage.
- AC-M11.8: the `scaffold` mechanics (apply, env secrets, gates) are proven by the matrix; a full interactive agent run in a fresh clone is still to be done by the owner.
- AC-M11.11: OpenCode v2.3.2 lists `adr` and `scaffold` and loads AGENTS.md (ADR-0011 §6).

## ADRs produced

- ADR-0011 Module manifest, marker convention and pruning script.

## Risks & mitigations

| Risk                                      | Mitigation                                                                       |
| ----------------------------------------- | -------------------------------------------------------------------------------- |
| Markers rot as code evolves               | `modules:check` in lint-staged + CI; matrix job in M13.                          |
| Pruning breaks imports not inside markers | AC-M11.3 matrix proves each combo builds; the grep check in AC-M11.5.            |
| JSON files cannot hold markers            | Handled through manifest `deps`/`env`; keep module wiring out of JSON otherwise. |
| Skill behaves differently across agents   | The script holds all mechanics; skills only interview and call it.               |

## Definition of Done

All ACs pass, ADR-0011 is merged, the commit is made and the status is set to Done.
