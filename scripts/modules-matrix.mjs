#!/usr/bin/env node

/**
 * scripts/modules-matrix.mjs — local stand-in for the M13 CI matrix (AC-M11.3).
 *
 * For each combo (mongo, mongo+auth, postgres, postgres+auth) it creates a
 * detached git worktree of HEAD, runs `modules.mjs apply`, then the gates:
 * install (lockfile re-resolved, since pruned deps change it), lint,
 * typecheck, test, build and the matching Playwright project. Postgres combos
 * need Docker. The worktree is always removed.
 *
 * It tests the COMMITTED tree (HEAD), not uncommitted changes.
 * Usage: pnpm modules:matrix [label ...]   e.g. `pnpm modules:matrix postgres`
 */

import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import process from 'node:process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COMBOS = [
  { label: 'mongo', args: ['--db=mongo', '--without=auth'] },
  { label: 'mongo+auth', args: ['--db=mongo'] },
  { label: 'postgres', args: ['--db=postgres', '--without=auth'] },
  { label: 'postgres+auth', args: ['--db=postgres'] },
];
const GATES = [
  ['install', '--no-frozen-lockfile'],
  ['lint'],
  ['typecheck'],
  ['test'],
  ['build'],
  ['test:e2e:web'],
];

const sh = (cmd, args, cwd, env = process.env) =>
  execFileSync(cmd, args, { cwd, env, stdio: 'inherit', shell: process.platform === 'win32' });

/** Like /scaffold: local env files from each .env.example, `*_SECRET` set to random bytes. */
function writeEnvFiles(dir) {
  const files = [
    ['apps/api/.env.example', 'apps/api/.env'],
    ['apps/web/.env.example', 'apps/web/.env.local'],
  ];
  for (const [example, target] of files) {
    const text = readFileSync(join(dir, example), 'utf8').replace(
      /^#?\s*([A-Z0-9_]*_SECRET)=.*$/gm,
      (_, key) => `${key}=${randomBytes(48).toString('base64url')}`,
    );
    writeFileSync(join(dir, target), text);
  }
}

function runCombo({ label, args }) {
  const dir = mkdtempSync(join(tmpdir(), `modules-matrix-${label.replace('+', '-')}-`));
  try {
    sh('git', ['worktree', 'add', '--detach', dir], REPO_ROOT);
    sh('node', ['scripts/modules.mjs', 'apply', ...args], dir);
    sh('node', ['scripts/modules.mjs', 'check'], dir);
    writeEnvFiles(dir);
    // Every gate runs so one pass reports all failures; Playwright needs a build.
    const failed = [];
    // Postgres: rebuild the migration journal for the selection (as /scaffold does).
    const gates = label.startsWith('postgres')
      ? [GATES[0], ['--filter', 'api', 'db:generate'], ...GATES.slice(1)]
      : GATES;
    for (const gate of gates) {
      if (gate[0] === 'test:e2e:web' && failed.includes('build')) continue;
      try {
        sh('pnpm', gate, dir, { ...process.env, CI: '1' });
      } catch {
        failed.push(gate[0]);
        if (gate[0] === 'install') break;
      }
    }
    if (failed.length > 0) throw new Error(`gates failed: ${failed.join(', ')}`);
    return true;
  } catch (err) {
    process.stderr.write(`combo ${label} failed: ${err.message}\n`);
    return false;
  } finally {
    try {
      sh('git', ['worktree', 'remove', '--force', dir], REPO_ROOT);
    } catch {
      rmSync(dir, { recursive: true, force: true });
      sh('git', ['worktree', 'prune'], REPO_ROOT);
    }
  }
}

const only = process.argv.slice(2);
const results = COMBOS.filter((c) => only.length === 0 || only.includes(c.label)).map((c) => ({
  label: c.label,
  ok: runCombo(c),
}));
process.stdout.write('\nmatrix summary\n');
for (const r of results) process.stdout.write(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.label}\n`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
