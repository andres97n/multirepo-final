---
name: scaffold
description: >
  Scaffold a new project from the boilerplate. Interviews the user for the DB
  engine, optional modules, app name, origins, ports and secrets, then runs the
  module pruning script, generates .env files, installs deps and runs the gates.
  Writes an ADR recording the selection and pinned dependency versions.
---

# Scaffold skill

Use this skill when the user asks to scaffold a new project from the boilerplate,
or to customize the module selection (DB engine, optional modules).

## Workflow

1. **Read context.** Load `modules.json` and `AGENTS.md`. Understand which
   modules are available and which are default.

2. **Interview the user** (ask all questions before acting):
   - **DB engine:** `mongo` (default) or `postgres`?
   - **Optional modules:** for each optional module (e.g. `auth`), keep or remove?
   - **App name:** used in `package.json` `name`, `README.md` title, ADR.
   - **Ports:** API port (default 3001), web port (default 3000).
   - **CORS origin(s):** comma-separated list (default `http://localhost:3000`).
   - **Secrets:** confirm that every `*_SECRET` variable (`JWT_ACCESS_SECRET`,
     `SESSION_SECRET` when `auth` is kept) is generated for them (step 5).
   - **Seed admin** (only if `auth` is kept): the admin email. The password is
     never asked in chat; `pnpm --filter api seed:admin` prompts for it later.

3. **Run `apply` (dry-run first):**

   ```bash
   node scripts/modules.mjs apply --db=<engine> [--without=<module,...>] --dry-run
   ```

   Show the summary to the user. Ask for confirmation before the real run.

4. **Run `apply` for real:**

   ```bash
   node scripts/modules.mjs apply --db=<engine> [--without=<module,...>]
   ```

   Then `pnpm modules:check` must pass.

5. **Generate `.env` files** (`apps/api/.env`, `apps/web/.env.local`):
   - First verify both are ignored: `git check-ignore apps/api/.env apps/web/.env.local`
     must print both paths. Stop if it does not.
   - Copy each `.env.example`, set ports, `CORS_ORIGIN` / `APP_ORIGIN`,
     `SEED_ADMIN_EMAIL`, and uncomment the `*_SECRET` lines.
   - Fill secrets **without printing them** (48 random bytes, base64url), e.g.:
     ```bash
     node -e "const fs=require('fs'),c=require('crypto');for(const[f,k]of[['apps/api/.env','JWT_ACCESS_SECRET'],['apps/web/.env.local','SESSION_SECRET']]){const s=fs.readFileSync(f,'utf8');fs.writeFileSync(f,s.replace(new RegExp('^#?\\\\s*'+k+'=.*$','m'),k+'='+c.randomBytes(48).toString('base64url')))}"
     ```
     Never `cat`/`echo` the `.env` files, and never copy secret values into chat,
     docs, `.env.example` or the ADR.

6. **Install and gate:**

   ```bash
   pnpm install          # updates the lockfile for the pruned deps
   pnpm --filter api db:generate   # postgres only: rebuilds the migration journal for the selection
   pnpm lint && pnpm typecheck && pnpm test && pnpm build
   pnpm test:e2e:web     # Playwright project matching the selection (Docker for Postgres)
   ```

   All must pass with 0 warnings and no type errors. Fix failures before going on.

7. **Update docs:**
   - `README.md`: replace boilerplate title/description with the app name.
   - `AGENTS.md`: adjust the "Modules" section to reflect the selected modules.
   - Remove references to pruned modules in `apps/*/AGENTS.md`.

8. **Write an ADR** (using the `adr` skill):
   - File: `docs/adr/NNNN-scaffold-<app-name>.md`
   - Record: the module selection, the dependency versions (from `pnpm-lock.yaml`
     or `package.json`), and any decisions made during the interview.
   - **Never** include secret values in the ADR.

9. **Report** to the user:
   - Selected modules
   - Ports and origins
   - Gate results (pass/fail)
   - ADR number

## Rules

- Secrets are ≥ 32 random bytes, written **only** to gitignored `.env` files,
  never echoed in chat, docs, or ADRs.
- The pruning script (`scripts/modules.mjs`) holds all mechanics; the skill only
  interviews and calls it.
- Never commit or push without the user's explicit request.
- Never hand-edit marker regions to prune; if `apply` gets something wrong, fix
  `modules.json` / the markers in the base repo instead.
