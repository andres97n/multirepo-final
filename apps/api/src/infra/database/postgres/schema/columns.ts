import { timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Columns every `PostgresRepository` table must spread: `id` is a uuid v7
 * generated app-side; timestamps are maintained by the repository.
 * Unique constraints MUST be named `<table>_<column>_unique` so the adapter can
 * report the conflicting field (ADR-0005).
 */
export const baseColumns = {
  id: uuid('id').primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};
