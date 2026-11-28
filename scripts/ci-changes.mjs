#!/usr/bin/env node

/**
 * scripts/ci-changes.mjs — decides whether a change needs the full module matrix in CI.
 *
 *   node scripts/ci-changes.mjs <base-sha>
 *
 * Prints `modules=true|false` and appends it to $GITHUB_OUTPUT when set. True when the diff
 * base...HEAD touches the module system: the manifest, the scripts that apply it, any module
 * path or marked file in modules.json, or dependencies (package.json / lockfile). A missing or
 * all-zero base (new branch, first push) is treated as true.
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ALWAYS = [
  'modules.json',
  'modules.schema.json',
  'scripts/modules.mjs',
  'scripts/combos.mjs',
  'scripts/ci-prepare.mjs',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  '.github/workflows/ci.yml',
];

/** Repo-relative prefixes whose change requires the matrix. */
export function watchedPrefixes(manifest) {
  const set = new Set(ALWAYS);
  for (const m of manifest.modules) for (const p of [...m.paths, ...m.markers]) set.add(p);
  return [...set];
}

export function touchesModules(files, manifest) {
  const prefixes = watchedPrefixes(manifest);
  return files.some(
    (f) => f.endsWith('package.json') || prefixes.some((p) => f === p || f.startsWith(`${p}/`)),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const base = process.argv[2] ?? '';
  let result = true;
  if (base && !/^0+$/.test(base)) {
    const files = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean);
    const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'modules.json'), 'utf8'));
    result = touchesModules(files, manifest);
  }
  process.stdout.write(`modules=${result}\n`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `modules=${result}\n`);
}
