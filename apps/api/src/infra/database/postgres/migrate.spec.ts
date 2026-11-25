import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { describe, expect, it } from 'vitest';
import { redactCredentials } from './migrate';

// The same journal the production migrator applies (node-postgres); PGlite
// proves the files are valid and idempotent without a running server.
// Journal-agnostic on purpose: modules:apply rewrites it per selection
// (without auth it is empty).
const MIGRATIONS_FOLDER = resolve(__dirname, '../../../../migrations');
const journal = JSON.parse(
  readFileSync(resolve(MIGRATIONS_FOLDER, 'meta/_journal.json'), 'utf8'),
) as { entries: unknown[] };

describe('postgres migrations', () => {
  it('applies every journal entry once and is a no-op on a second run', async () => {
    const client = new PGlite();
    try {
      const db = drizzle(client);
      const applied = async (): Promise<number | undefined> =>
        (
          await client.query<{ count: number }>(
            `SELECT count(*)::int AS count FROM drizzle."__drizzle_migrations"`,
          )
        ).rows[0]?.count;

      await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
      expect(await applied()).toBe(journal.entries.length);

      await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
      expect(await applied()).toBe(journal.entries.length);
    } finally {
      await client.close();
    }
  });

  it('redacts the password of a connection string in an error message', () => {
    const redacted = redactCredentials('connect to postgres://app:s3cret@db:5432/app failed');
    expect(redacted).not.toContain('s3cret');
    expect(redacted).toContain('//[REDACTED]@db');
  });

  it('redacts passwords with an unencoded slash or at sign', () => {
    for (const url of ['postgres://app:pa/ss@db/app', 'postgres://app:p@ss@db/app']) {
      expect(redactCredentials(`connect to ${url} failed`)).toBe(
        'connect to postgres://[REDACTED]@db/app failed',
      );
    }
  });

  it('leaves a message without credentials unchanged', () => {
    const message = 'relation "users" does not exist';
    expect(redactCredentials(message)).toBe(message);
  });

  it('masks a user-only connection string too', () => {
    expect(redactCredentials('failed for postgres://app@host:5432/app')).toBe(
      'failed for postgres://[REDACTED]@host:5432/app',
    );
  });
});
