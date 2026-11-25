import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { DEFAULT_DATABASE_URL } from './postgres.constants';

/**
 * Masks credentials in connection strings (`[scheme:]//user:pass@` → `[scheme:]//[REDACTED]@`).
 * Greedy up to the last `@` of the token, so an unencoded `/` or `@` in a password cannot
 * leak (over-redaction is fine). Backstop: every occurrence of the known `secret` (raw and
 * URL-decoded) is masked too, wherever it appears.
 */
export function redactCredentials(message: string, secret?: string): string {
  let out = message.replace(/((?:[a-z][a-z0-9+.-]*:)?\/\/)\S*@/gi, '$1[REDACTED]@');
  if (secret) {
    for (const value of new Set([secret, safeDecode(secret)])) {
      out = out.replaceAll(value, '[REDACTED]');
    }
  }
  return out;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Password of a connection string, or undefined when it has none or does not parse. */
function passwordOf(databaseUrl: string): string | undefined {
  try {
    return new URL(databaseUrl).password || undefined;
  } catch {
    return undefined;
  }
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
  const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
  runMigrations(databaseUrl, resolve(process.cwd(), 'migrations')).then(
    () => {
      process.stdout.write(`${JSON.stringify({ level: 'info', msg: 'migrations applied' })}\n`);
    },
    (error: unknown) => {
      const message = redactCredentials(
        error instanceof Error ? error.message : 'unknown error',
        passwordOf(databaseUrl),
      );
      process.stderr.write(
        `${JSON.stringify({ level: 'error', msg: 'migrations failed', message })}\n`,
      );
      process.exitCode = 1;
    },
  );
}
