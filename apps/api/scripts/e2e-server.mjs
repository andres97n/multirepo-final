import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// @module:db-postgres
import { execFileSync, execSync } from 'node:child_process';
// @end-module:db-postgres
// @module:db-mongo
import { MongoMemoryServer } from 'mongodb-memory-server';
// @end-module:db-mongo

/**
 * Database + built api for the web E2E suite (apps/web/playwright.config.ts).
 * The engine follows the wiring in src/app.module.ts: MongoDB runs in memory;
 * Postgres runs in Docker (private compose project `e2e`) and is migrated with
 * the real `db:migrate` step. `--down` removes the Postgres container (called
 * by apps/web/e2e/global-teardown.ts; Playwright kills this process tree).
 * Each engine's branch sits in its marker region so `modules:apply` can drop it.
 */
const appModule = readFileSync(new URL('../src/app.module.ts', import.meta.url), 'utf8');
const engine = /^\s*PostgresDatabaseModule\.forRoot\(\)/m.test(appModule) ? 'postgres' : 'mongo';
const down = process.argv.includes('--down');

// @module:db-postgres
const API_DIR = fileURLToPath(new URL('..', import.meta.url));

function compose(...args) {
  const file = fileURLToPath(new URL('../../../compose.dev.yaml', import.meta.url));
  execFileSync('docker', ['compose', '-p', 'e2e', '-f', file, ...args], {
    stdio: 'inherit',
    env: { ...process.env, POSTGRES_PORT: process.env.E2E_POSTGRES_PORT },
  });
}

if (engine === 'postgres') {
  compose('down', '-v');
  if (!down) {
    compose('up', '-d', '--wait', 'postgres');
    execSync('pnpm db:migrate', { cwd: API_DIR, stdio: 'inherit', env: process.env });
  }
}
// @end-module:db-postgres

if (down) {
  process.exit(0);
}

// @module:db-mongo
if (engine === 'mongo') {
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
// @end-module:db-mongo

await import('../dist/main.js');
