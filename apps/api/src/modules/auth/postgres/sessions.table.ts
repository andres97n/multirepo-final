import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { baseColumns } from '../../../infra/database/postgres/schema/columns';

/**
 * Refresh-token session families. `token_hash` is unique under the
 * `<table>_<column>_unique` naming rule (conflicts report `tokenHash`);
 * `user_id`/`family_id` are indexed for the bulk revoke and cleanup paths.
 */
export const sessions = pgTable(
  'sessions',
  {
    ...baseColumns,
    userId: uuid('user_id').notNull(),
    familyId: uuid('family_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    familyExpiresAt: timestamp('family_expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    replacedBy: uuid('replaced_by'),
    previousTokenHash: text('previous_token_hash'),
    retiredTokenHashes: text('retired_token_hashes')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    rotatedAt: timestamp('rotated_at', { withTimezone: true }),
    ip: text('ip'),
    userAgent: text('user_agent'),
  },
  (t) => [
    unique('sessions_token_hash_unique').on(t.tokenHash),
    index('sessions_user_id_index').on(t.userId),
    index('sessions_family_id_index').on(t.familyId),
    index('sessions_retired_token_hashes_index').using('gin', t.retiredTokenHashes),
  ],
);
