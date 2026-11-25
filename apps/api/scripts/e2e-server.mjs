import { execFileSync, execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * Database + built api for the web E2E suite (apps/web/playwright.config.ts).
 * The engine follows the wiring in src/app.module.ts: MongoDB runs in memory;
 * Postgres runs in Docker (private compose project `e2e`) and is migrated with
 * the real `db:migrate` step. `--down` removes the Postgres container (called
 * by apps/web/e2e/global-teardown.ts; Playwright kills this process tree).
 */
const API_DIR = fileURLToPath(new URL('..', import.meta.url));
const appModule = readFileSync(new URL('../src/app.module.ts', import.meta.url), 'utf8');
const engine = /^\s*PostgresDatabaseModule\.forRoot\(\)/m.test(appModule) ? 'postgres' : 'mongo';

function compose(...args) {
  const file = fileURLToPath(new URL('../../../compose.dev.yaml', import.meta.url));
  execFileSync('docker', ['compose', '-p', 'e2e', '-f', file, ...args], {
    stdio: 'inherit',
    env: { ...process.env, POSTGRES_PORT: process.env.E2E_POSTGRES_PORT },
  });
}

if (process.argv.includes('--down')) {
  if (engine === 'postgres') {
    compose('down', '-v');
  }
  process.exit(0);
}

if (engine === 'postgres') {
  compose('down', '-v');
  compose('up', '-d', '--wait', 'postgres');
  execSync('pnpm db:migrate', { cwd: API_DIR, stdio: 'inherit', env: process.env });
} else {
  const port = Number(process.env.E2E_MONGO_PORT);
  const server = await MongoMemoryServer.create({
    binary: { version: '8.0.4' }, // same as src/infra/database/mongo/testing/mongo-memory.ts
    instance: { port },
  });
  if (Number(new URL(server.getUri()).port) !== port) {
    await server.stop();
    throw new Error(`E2E mongo port ${String(port)} is busy`);
  }
}

await import('../dist/main.js');
