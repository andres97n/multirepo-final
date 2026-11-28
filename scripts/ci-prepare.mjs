#!/usr/bin/env node

/**
 * scripts/ci-prepare.mjs — the `prepare-command` for the platform-config reusable workflows.
 *
 *   node scripts/ci-prepare.mjs                 default selection (mongo+auth): frozen install
 *   node scripts/ci-prepare.mjs postgres+auth   apply that combo first, then re-resolve the lockfile
 *
 * Both write apps/api/.env and apps/web/.env.local from the .env.example files with random
 * secrets (next build validates env, so the web build needs them).
 */

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { COMBOS, writeEnvFiles } from './combos.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Commands to run for a combo label (undefined = default selection, tree untouched). */
export function planSteps(label) {
  if (label === undefined) return [['pnpm', 'install', '--frozen-lockfile']];
  const combo = COMBOS.find((c) => c.label === label);
  if (!combo) {
    throw new Error(
      `unknown combo "${label}"; expected one of ${COMBOS.map((c) => c.label).join(', ')}`,
    );
  }
  return [
    ['node', 'scripts/modules.mjs', 'apply', ...combo.args],
    ['node', 'scripts/modules.mjs', 'check'],
    // Pruned deps change the lockfile, so it is re-resolved for the combo.
    ['pnpm', 'install', '--no-frozen-lockfile'],
    // Postgres: rebuild the migration journal for the selection (as /scaffold does).
    ...(label.startsWith('postgres') ? [['pnpm', '--filter', 'api', 'db:generate']] : []),
  ];
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    for (const [cmd, ...args] of planSteps(process.argv[2])) {
      process.stdout.write(`$ ${cmd} ${args.join(' ')}\n`);
      execFileSync(cmd, args, {
        cwd: REPO_ROOT,
        stdio: 'inherit',
        shell: process.platform === 'win32',
      });
    }
    writeEnvFiles(REPO_ROOT);
    process.stdout.write('env files written: apps/api/.env, apps/web/.env.local\n');
  } catch (err) {
    process.stderr.write(`ci-prepare failed: ${err.message}\n`);
    process.exit(1);
  }
}
