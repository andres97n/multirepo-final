import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

/** Driver-agnostic Drizzle database (node-postgres in prod, PGlite in tests). */
export type PostgresDb = PgDatabase<PgQueryResultHKT>;
