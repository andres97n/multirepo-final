import type { PageQuery } from '@repo/contracts';
import { Injectable, Inject } from '@nestjs/common';
import { eq, getTableColumns, getTableName, sql } from 'drizzle-orm';
import { validate as isUuid } from 'uuid';
import { NotFoundError } from '../../../infra/database/core/errors';
import type { Filter, Paginated } from '../../../infra/database/core/query';
import { POSTGRES_DB } from '../../../infra/database/postgres/postgres.constants';
import { mapPostgresError } from '../../../infra/database/postgres/postgres-error.mapper';
import { PostgresRepository } from '../../../infra/database/postgres/postgres.repository';
import type { PostgresDb } from '../../../infra/database/postgres/postgres.types';
import type { LockoutPolicy, User } from '../auth.types';
import { UsersRepository } from '../users.repository';
import { users } from './users.table';

/** `role` (contract) is served by the array column `roles` in `list()`. */
const USER_FIELDS = ['id', 'email', 'roles', 'status'] as const;

/** Row -> `User` entity: timestamps stay in the DB (mirrors the base mapper). */
function toUser(row: unknown): User {
  const entity = { ...(row as Record<string, unknown>) };
  delete entity.createdAt;
  delete entity.updatedAt;
  return entity as unknown as User;
}

/**
 * Postgres implementation of `UsersRepository`. `findById` is inherited. The
 * lockout ladder runs as one `UPDATE ... RETURNING`: every `SET` expression
 * sees the pre-update row, so the increment is computed once and the `CASE`
 * branches on the new count — concurrent failures can never clobber each
 * other's count. Bound parameters only, no string-built SQL.
 */
@Injectable()
export class PostgresUsersRepository extends PostgresRepository<User> implements UsersRepository {
  private readonly columnToField = new Map(
    Object.entries(getTableColumns(users)).map(([key, column]) => [column.name, key]),
  );

  constructor(@Inject(POSTGRES_DB) db: PostgresDb) {
    super(db, users, USER_FIELDS);
  }

  findByEmail(email: string): Promise<User | null> {
    return this.findOne([{ field: 'email', op: 'eq', value: email }]);
  }

  async recordFailedLogin(id: string, lock: LockoutPolicy, now: Date): Promise<User> {
    if (!isUuid(id)) {
      throw new NotFoundError();
    }
    const count = sql`${users.failedLoginCount} + 1`;
    const rows = await this.runGuard(() =>
      this.db
        .update(users)
        .set({
          failedLoginCount: count,
          // The `${now}` cast names the injected instant as timestamptz so
          // `+ make_interval` adds the ladder delay to it.
          lockedUntil: sql`case
            when ${count} >= ${lock.threshold}
            then cast(${now} as timestamptz) + make_interval(secs => least(
              ${lock.baseSeconds} * power(2, ${count} - ${lock.threshold}),
              ${lock.maxSeconds}
            ))
            else ${users.lockedUntil}
          end`,
          updatedAt: now,
        })
        .where(eq(users.id, id))
        .returning(),
    );
    const row = rows[0];
    if (row === undefined) {
      throw new NotFoundError();
    }
    return toUser(row);
  }

  async resetFailedLogins(id: string): Promise<User> {
    if (!isUuid(id)) {
      throw new NotFoundError();
    }
    const rows = await this.runGuard(() =>
      this.db
        .update(users)
        .set({ failedLoginCount: 0, lockedUntil: null, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning(),
    );
    const row = rows[0];
    if (row === undefined) {
      throw new NotFoundError();
    }
    return toUser(row);
  }

  /** Login-time rehash: only the hash changes (core `update` also stamps updatedAt). */
  setPasswordHash(id: string, passwordHash: string): Promise<User> {
    return this.update(id, { passwordHash });
  }

  /**
   * Chosen translation (documented per plan): `role -> roles`, and `eq ->
   * contains` because the shared translator models array membership as
   * `arrayContains` — the same "some element equals the value" semantics the
   * Mongo adapter gets from equality on an array path.
   */
  list(page: PageQuery, filter: Filter): Promise<Paginated<User>> {
    const translated: Filter = filter.map((item) =>
      item.field === 'role'
        ? { ...item, field: 'roles', op: item.op === 'eq' ? ('contains' as const) : item.op }
        : item,
    );
    return this.findMany(page, translated);
  }

  /** The base-class error guard is private; atomic operations wrap it here. */
  private async runGuard<R>(operation: () => Promise<R>): Promise<R> {
    try {
      return await operation();
    } catch (error) {
      throw mapPostgresError(error, getTableName(users), this.columnToField);
    }
  }
}
