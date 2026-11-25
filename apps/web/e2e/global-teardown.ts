import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { apiEnv } from './env';

/** Removes the Postgres E2E container (no-op on Mongo); see apps/api/scripts/e2e-server.mjs. */
export default function globalTeardown(): void {
  execFileSync(process.execPath, ['scripts/e2e-server.mjs', '--down'], {
    cwd: fileURLToPath(new URL('../../api/', import.meta.url)),
    env: { ...process.env, ...apiEnv },
    stdio: 'inherit',
  });
}
