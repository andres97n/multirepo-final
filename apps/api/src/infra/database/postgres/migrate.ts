import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { DEFAULT_DATABASE_URL } from './postgres.constants';

/** Masks credentials in connection strings (`//user:pass@` → `//[REDACTED]@`). */
export function redactCredentials(message: string): string {
  return message.replace(/\/\/[^/@\s]*@/g, '//[REDACTED]@');
}

/** Applies pending Drizzle migrations from `migrationsFolder`. Idempotent. */
export async function runMigrations(databaseUrl: string, migrationsFolder: string): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runMigrations(
    process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
    resolve(process.cwd(), 'migrations'),
  ).then(
    () => {
      process.stdout.write(`${JSON.stringify({ level: 'info', msg: 'migrations applied' })}\n`);
    },
    (error: unknown) => {
      const message = redactCredentials(error instanceof Error ? error.message : 'unknown error');
      process.stderr.write(
        `${JSON.stringify({ level: 'error', msg: 'migrations failed', message })}\n`,
      );
      process.exitCode = 1;
    },
  );
}
