import { integer, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { baseColumns } from '../../../infra/database/postgres/schema/columns';

/**
 * Auth users table. `id`/timestamps come from `baseColumns`; the unique
 * constraint follows the `<table>_<column>_unique` naming rule (ADR-0005) so
 * conflicts report the `email` field.
 */
export const users = pgTable(
  'users',
  {
    ...baseColumns,
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    roles: text('roles').array().notNull(),
    status: text('status').notNull(),
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
  },
  (t) => [unique('users_email_unique').on(t.email)],
);
