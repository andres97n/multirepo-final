import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { describe, expect, it } from 'vitest';

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
});
