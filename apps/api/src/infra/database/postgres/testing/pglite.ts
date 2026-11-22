import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import type { PostgresDb } from '../postgres.types';

export interface TestPostgres {
  db: PostgresDb;
  client: PGlite;
  stop: () => Promise<void>;
}

/**
 * In-process Postgres (PGlite) with the given DDL applied. Each test file
 * passes the DDL of its own tables, so the schema is pushed per file (AC-M05.1).
 */
export async function startPglite(ddl: string): Promise<TestPostgres> {
  const client = new PGlite();
  await client.exec(ddl);
  return { db: drizzle(client), client, stop: () => client.close() };
}

// ponytail: hand-written DDL mirrors widget.schema.ts; move to drizzle-kit
// pushSchema if test tables multiply.
export const WIDGETS_DDL = `
  CREATE TABLE widgets (
    id uuid PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    sku text NOT NULL,
    name text NOT NULL,
    price double precision NOT NULL,
    tags text[] NOT NULL,
    active boolean NOT NULL,
    CONSTRAINT widgets_sku_unique UNIQUE (sku)
  );
`;
