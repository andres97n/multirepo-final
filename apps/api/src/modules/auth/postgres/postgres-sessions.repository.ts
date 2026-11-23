import { Injectable, Inject } from '@nestjs/common';
import {
  and,
  arrayContains,
  eq,
  getTableColumns,
  getTableName,
  isNull,
  lt,
  or,
  sql,
} from 'drizzle-orm';
import { validate as isUuid } from 'uuid';
import { NotFoundError } from '../../../infra/database/core/errors';
import { POSTGRES_DB } from '../../../infra/database/postgres/postgres.constants';
import { mapPostgresError } from '../../../infra/database/postgres/postgres-error.mapper';
import { PostgresRepository } from '../../../infra/database/postgres/postgres.repository';
import type { PostgresDb } from '../../../infra/database/postgres/postgres.types';
import type { Session } from '../auth.types';
import { SessionsRepository } from '../sessions.repository';
import { sessions } from './sessions.table';

/** Lookups the port performs; every one is a plain equality on these columns. */
const SESSION_FIELDS = ['id', 'tokenHash', 'userId', 'familyId'] as const;

/** Row -> `Session` entity: timestamps stay in the DB (mirrors the base mapper). */
function toSession(row: unknown): Session {
  const entity = { ...(row as Record<string, unknown>) };
  delete entity.createdAt;
  delete entity.updatedAt;
  return entity as unknown as Session;
}

/**
 * Postgres implementation of `SessionsRepository`. `findById` is inherited.
 * Every mutation is a single statement; `rotate` carries the race condition in
 * its `WHERE` (`revoked_at IS NULL AND token_hash = expected`), so a second
 * concurrent attempt matches zero rows and returns null instead of rotating
 * twice. Bound parameters only, no string-built SQL.
 */
@Injectable()
export class PostgresSessionsRepository
  extends PostgresRepository<Session>
  implements SessionsRepository
{
  private readonly columnToField = new Map(
    Object.entries(getTableColumns(sessions)).map(([key, column]) => [column.name, key]),
  );

  constructor(@Inject(POSTGRES_DB) db: PostgresDb) {
    super(db, sessions, SESSION_FIELDS);
  }

  findByTokenHash(tokenHash: string): Promise<Session | null> {
    return this.findOne([{ field: 'tokenHash', op: 'eq', value: tokenHash }]);
  }

  async findByRetiredTokenHash(tokenHash: string): Promise<Session | null> {
    const rows = await this.runGuard(() =>
      this.db
        .select()
        .from(sessions)
        .where(arrayContains(sessions.retiredTokenHashes, [tokenHash]))
        .limit(1),
    );
    const row = rows[0];
    return row === undefined ? null : toSession(row);
  }

  async rotate(
    id: string,
    expectedTokenHash: string,
    next: { tokenHash: string; expiresAt: Date },
    now: Date,
  ): Promise<Session | null> {
    if (!isUuid(id)) {
      return null;
    }
    const rows = await this.runGuard(() =>
      this.db
        .update(sessions)
        .set({
          tokenHash: next.tokenHash,
          expiresAt: next.expiresAt,
          // SET expressions see the pre-update row, so this keeps the hash
          // the session is rotating away from (replay-grace window).
          previousTokenHash: sql`${sessions.tokenHash}`,
          retiredTokenHashes: sql`array_append(${sessions.retiredTokenHashes}, ${sessions.tokenHash})`,
          rotatedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(sessions.id, id),
            isNull(sessions.revokedAt),
            eq(sessions.tokenHash, expectedTokenHash),
          ),
        )
        .returning(),
    );
    const row = rows[0];
    return row === undefined ? null : toSession(row);
  }

  /**
   * Family head for the replay-grace path: the unrevoked session, preferring
   * the most recently rotated one (`DESC NULLS LAST` keeps rotated heads
   * ahead of never-rotated rows). Null for unknown/revoked families.
   */
  async findActiveByFamily(familyId: string): Promise<Session | null> {
    if (!isUuid(familyId)) {
      return null;
    }
    const rows = await this.runGuard(() =>
      this.db
        .select()
        .from(sessions)
        .where(and(eq(sessions.familyId, familyId), isNull(sessions.revokedAt)))
        .orderBy(sql`${sessions.rotatedAt} desc nulls last`)
        .limit(1),
    );
    const row = rows[0];
    return row === undefined ? null : toSession(row);
  }

  async revoke(id: string, now: Date): Promise<void> {
    if (!isUuid(id)) {
      throw new NotFoundError();
    }
    const rows = await this.runGuard(() =>
      this.db
        .update(sessions)
        .set({ revokedAt: now, updatedAt: now })
        .where(and(eq(sessions.id, id), isNull(sessions.revokedAt)))
        .returning({ id: sessions.id }),
    );
    if (rows.length === 0 && !(await this.exists(id))) {
      throw new NotFoundError();
    }
  }

  async revokeFamily(familyId: string, now: Date): Promise<void> {
    if (!isUuid(familyId)) {
      return;
    }
    await this.runGuard(() =>
      this.db
        .update(sessions)
        .set({ revokedAt: now, updatedAt: now })
        .where(and(eq(sessions.familyId, familyId), isNull(sessions.revokedAt))),
    );
  }

  async revokeAllForUser(userId: string, now: Date): Promise<void> {
    if (!isUuid(userId)) {
      return;
    }
    await this.runGuard(() =>
      this.db
        .update(sessions)
        .set({ revokedAt: now, updatedAt: now })
        .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt))),
    );
  }

  async deleteExpired(now: Date): Promise<number> {
    const rows = await this.runGuard(() =>
      this.db
        .delete(sessions)
        .where(
          // Past the sliding expiry or past the absolute family cap.
          or(lt(sessions.expiresAt, now), lt(sessions.familyExpiresAt, now)),
        )
        .returning({ id: sessions.id }),
    );
    return rows.length;
  }

  /** The base-class error guard is private; atomic operations wrap it here. */
  private async runGuard<R>(operation: () => Promise<R>): Promise<R> {
    try {
      return await operation();
    } catch (error) {
      throw mapPostgresError(error, getTableName(sessions), this.columnToField);
    }
  }
}
