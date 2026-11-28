/**
 * scripts/combos.mjs — shared by modules-matrix.mjs (local) and ci-prepare.mjs (CI).
 *
 * COMBOS: the four supported module selections and their `modules.mjs apply` args.
 * writeEnvFiles: local env files from each .env.example, `*_SECRET` set to random bytes
 * (the same thing /scaffold does).
 */

import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const COMBOS = [
  { label: 'mongo', args: ['--db=mongo', '--without=auth'] },
  { label: 'mongo+auth', args: ['--db=mongo'] },
  { label: 'postgres', args: ['--db=postgres', '--without=auth'] },
  { label: 'postgres+auth', args: ['--db=postgres'] },
];

export const ENV_FILES = [
  ['apps/api/.env.example', 'apps/api/.env'],
  ['apps/web/.env.example', 'apps/web/.env.local'],
];

export function writeEnvFiles(dir) {
  for (const [example, target] of ENV_FILES) {
    const text = readFileSync(join(dir, example), 'utf8').replace(
      /^#?\s*([A-Z0-9_]*_SECRET)=.*$/gm,
      (_, key) => `${key}=${randomBytes(48).toString('base64url')}`,
    );
    writeFileSync(join(dir, target), text);
  }
}
