import { execFileSync, execSync } from 'node:child_process';

/**
 * Starts one migrated Postgres for the whole e2e run (compose.dev.yaml in the
 * private project `api-e2e`, needs Docker) and points `DATABASE_URL` at it.
 */
export default function globalSetup(): () => void {
  const port = '5435';
  const url = `postgres://app:app@127.0.0.1:${port}/app`;
  // `test:e2e` runs from apps/api (the tsconfig is CommonJS, so no import.meta).
  const file = '../../compose.dev.yaml';
  const compose = (...args: string[]): void => {
    execFileSync('docker', ['compose', '-p', 'api-e2e', '-f', file, ...args], {
      stdio: 'inherit',
      env: { ...process.env, POSTGRES_PORT: port },
    });
  };
  const down = (): void => {
    compose('down', '-v');
  };

  down();
  try {
    compose('up', '-d', '--wait', 'postgres');
    process.env.DATABASE_URL = url;
    execSync('pnpm db:migrate', {
      stdio: 'inherit',
    });
  } catch (error) {
    down();
    throw error;
  }
  return down;
}
