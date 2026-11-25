# ADR-0011 — Module manifest, marker convention and pruning script

- Status: Accepted
- Date: 2026-11-24
- Supersedes: — / Superseded-by: —

## Context

The boilerplate must let a project choose its database engine (Mongo or Postgres) and its optional modules (auth) on day one, without leaving dead code, unused deps, or dangling env vars. M11 formalizes this: the selection must be deterministic, agent-driven, idempotent, and leave the tree green.

Manual edits were already error-prone before M11 (the `@module:*` marker regions were edited by hand, with no guard against forgetting a marker, breaking balance, or leaving a stale dep). The `scripts/live-check/flip-engine.mjs` helper flips the engine temporarily for live checks only; it does not prune.

## Decision

### 1. Module manifest (`modules.json`)

A single JSON file at the repo root lists every module with:

- **Metadata**: `name`, `kind` (`core` | `optional` | `db`), `group`, `default`, `description`.
- **Touchpoints**: `paths[]` (deleted when pruned), `markers[]` (files with `@module:<name>` regions).
- **Prunable wiring**: `deps` (npm deps per workspace), `env[]` (variable names), `compose[]` (Docker services), `packageScripts`, `packageExports`.
- **Constraints**: `requires[]` (module names or `group:*`), `conflicts[]`.

A JSON Schema (`modules.schema.json`) validates the shape. `pnpm modules:check` validates the manifest + every marker file on the base repo.

### 2. Marker convention

- **TS/JS**: `// @module:<name>` … `// @end-module:<name>`
- **YAML/env**: `# @module:<name>` … `# @end-module:<name>`
- **JSON**: no comments; module-specific entries are handled through the manifest's `deps`, `packageExports`, `packageScripts`.

Every marker region in a shared file must be listed in the module's `markers[]`. The check command catches orphans, unknown names, and unbalanced regions with file:line precision.

### 3. Pruning script (`scripts/modules.mjs`)

- `check`: schema + manifest + markers + requires/conflicts + exactly one default `db` module.
- `list`: shows every module with its kind/group/default.
- `apply --db=<mongo|postgres> [--without=<a,b>] [--dry-run]`:
  1. Resolves the selection (selected db engine + kept optional modules).
  2. Validates requires/conflicts.
  3. Deletes `paths` of removed modules.
  4. Strips marker regions of removed modules and removes the marker comment lines of kept modules (clean output, no leftover `@module:` comments).
  5. Prunes deps, scripts, and exports from each workspace's `package.json`.
  6. Rewrites `modules.json` to the selected set.
- **Idempotent**: running `apply` twice with the same args produces zero diff on the second run.
- **Stdlib-only**: no npm deps. Uses `node:fs`, `node:path`, `node:url`, `node:process`.
- **Configurable root** via `MODULES_ROOT` env var (used by tests to run against a fixture).

### 4. Agent skills (`.claude/skills/`)

- **`scaffold/SKILL.md`**: interviews the user for DB engine, optional modules, app name, ports, origins, secrets; runs the script; generates `.env` files (secrets ≥ 32 random bytes, never echoed); runs the gates; writes an ADR.
- **`adr/SKILL.md`**: creates the next numbered ADR from the template, supports superseding with cross-links.

### 5. Inactive engine ships commented out

The base repo wires `db-mongo` (default). `db-postgres` regions contain only commented code (TS) or commented `KEY=value` lines (env). When `apply` selects the non-default engine, it uncomments those regions one level (in env files only `KEY=value` lines, so description comments stay comments). A region with any live line, such as both engine branches in `apps/api/scripts/e2e-server.mjs`, is left as is. Per-engine code of a feature (`modules/auth/mongo`, `modules/auth/postgres`, engine-specific e2e specs) is listed under both the feature's and the engine's `paths`. The rewritten manifest drops paths that no longer exist, so `check` stays green after `apply`.

### 6. OpenCode/OMO

No extra config is needed. Verified once on 2026-11-24 with OpenCode v2.3.2 (`opencode run`): it loads `AGENTS.md` as instructions and lists `adr` and `scaffold` from `.claude/skills/` natively. `opencode.json` keeps only the permission policy.

### 7. Quality gates

- `modules:check` runs in `lint-staged` when `modules.json` or any file in a `markers[]` list is staged.
- `pnpm modules:matrix [combo]` runs the 4 combos in detached git worktrees of HEAD: apply, check, `pnpm install` (lockfile re-resolved), lint, typecheck, test, build and the matching Playwright project (Docker for Postgres). M13 moves it to CI.
- `node --test "scripts/*.test.mjs"` covers check errors (unbalanced, unknown, orphan, missing path, both engines, auth without db, requires cycle, schema), apply (paths, deps, scripts, exports, markers, nested regions, engine enabling, manifest rewrite), idempotency, dry-run and argument errors, at ≥ 90% line coverage.
- The M04 `db-mongo.markers.spec.ts` balance test is removed; `modules:check` supersedes it for every module.

## Alternatives

- **Bash script**: rejected — cross-platform issues, fragile text processing.
- **Per-module files with `#ifdef`-style pragmas**: rejected — harder to reason about, no manifest, no automated deps/env pruning.
- **A dedicated tool (e.g. Yeoman)**: rejected — too heavy; the script is a few hundred lines of stdlib and does the job.

## Consequences

- Marker regions are the **single source of truth** for which code belongs to which optional module. A module that doesn't mark its touchpoints in shared files fails `modules:check`.
- Adding a new optional module requires updating `modules.json`, adding markers in shared files, and running the matrix. The `scaffold` skill guides this.
- The base repo always has all modules wired. Pruning happens on first `apply`.
- `modules:check` runs in pre-commit and CI (M13), catching drift before it reaches main.
