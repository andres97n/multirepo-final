import type { PageQuery } from '@repo/contracts';
import { count, eq, getTableColumns, getTableName } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { v7 as uuidv7, validate as isUuid } from 'uuid';
import { MAX_PAGE_LIMIT } from '../core/constants';
import { InvalidQueryError, NotFoundError } from '../core/errors';
import type { Filter, Paginated } from '../core/query';
import type { Repository } from '../core/repository';
import { mapPostgresError } from './postgres-error.mapper';
import { PostgresQueryTranslator } from './postgres-query.translator';
import { RESERVED_WRITE_KEYS } from './postgres.constants';
import type { PostgresDb } from './postgres.types';

/**
 * Drizzle/PostgreSQL adapter for the `Repository<T>` port. `table` must spread
 * `baseColumns` (uuid `id`, `createdAt`, `updatedAt`). All driver usage lives
 * under `infra/database/postgres` (AC-M05.9); feature code depends on the port.
 */
export abstract class PostgresRepository<T extends { id: string }> implements Repository<T> {
  private readonly translator: PostgresQueryTranslator;
  private readonly columns: Record<string, PgColumn>;
  private readonly idColumn: PgColumn;
  private readonly tableName: string;
  private readonly fieldByColumn: ReadonlyMap<string, string>;

  constructor(
    private readonly db: PostgresDb,
    private readonly table: PgTable,
    allowedFields: readonly string[],
  ) {
    this.translator = new PostgresQueryTranslator(table, allowedFields);
    this.columns = getTableColumns(table);
    this.idColumn = this.columns.id as PgColumn;
    this.tableName = getTableName(table);
    this.fieldByColumn = new Map(
      Object.entries(this.columns).map(([key, column]) => [column.name, key]),
    );
  }

  async findById(id: string): Promise<T> {
    this.assertUuid(id);
    const [row] = await this.guard(() =>
      this.db.select().from(this.table).where(eq(this.idColumn, id)).limit(1),
    );
    return this.mapRow(row);
  }

  async findOne(filter: Filter): Promise<T | null> {
    const where = this.translator.translateFilter(filter);
    const order = this.translator.translateSort(undefined);
    const [row] = await this.guard(() =>
      this.db
        .select()
        .from(this.table)
        .where(where)
        .orderBy(...order)
        .limit(1),
    );
    return row === undefined ? null : this.mapRow(row);
  }

  async findMany(page: PageQuery, filter: Filter = []): Promise<Paginated<T>> {
    const where = this.translator.translateFilter(filter);
    const order = this.translator.translateSort(page.sort);
    // PageQuery already caps the limit; clamp again defensively (AC-M04.2).
    const limit = Math.min(page.limit, MAX_PAGE_LIMIT);
    const offset = (page.page - 1) * limit;
    const [rows, totals] = await this.guard(() =>
      Promise.all([
        this.db
          .select()
          .from(this.table)
          .where(where)
          .orderBy(...order)
          .limit(limit)
          .offset(offset),
        this.db.select({ total: count() }).from(this.table).where(where),
      ]),
    );
    return {
      items: rows.map((row) => this.mapRow(row)),
      page: page.page,
      limit,
      total: totals[0]?.total ?? 0,
    };
  }

  async create(data: Omit<T, 'id'>): Promise<T> {
    this.assertWritableKeys(data);
    const [row] = await this.guard(() =>
      this.db
        .insert(this.table)
        .values({ ...data, id: uuidv7() } as never)
        .returning(),
    );
    return this.mapRow(row);
  }

  async update(id: string, patch: Partial<Omit<T, 'id'>>): Promise<T> {
    this.assertUuid(id);
    this.assertWritableKeys(patch);
    const [row] = await this.guard(() =>
      this.db
        .update(this.table)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(this.idColumn, id))
        .returning(),
    );
    return this.mapRow(row);
  }

  async delete(id: string): Promise<void> {
    this.assertUuid(id);
    const rows = await this.guard(() =>
      this.db.delete(this.table).where(eq(this.idColumn, id)).returning({ id: this.idColumn }),
    );
    if (rows.length === 0) {
      throw new NotFoundError();
    }
  }

  async exists(id: string): Promise<boolean> {
    if (typeof id !== 'string' || !isUuid(id)) {
      return false;
    }
    const rows = await this.guard(() =>
      this.db.select({ id: this.idColumn }).from(this.table).where(eq(this.idColumn, id)).limit(1),
    );
    return rows.length > 0;
  }

  /** Wraps a driver call so failures surface as core `DbError`s. */
  private async guard<R>(operation: () => Promise<R>): Promise<R> {
    try {
      return await operation();
    } catch (error) {
      throw mapPostgresError(error, this.tableName, this.fieldByColumn);
    }
  }

  /** Malformed (or non-string) ids are 404s, never a driver cast error. */
  private assertUuid(id: unknown): asserts id is string {
    if (typeof id !== 'string' || !isUuid(id)) {
      throw new NotFoundError();
    }
  }

  /** Writes may only touch real, non-reserved columns (no `$set`, `_id`, ...). */
  private assertWritableKeys(data: object): void {
    for (const key of Object.keys(data)) {
      if (RESERVED_WRITE_KEYS.includes(key) || !Object.hasOwn(this.columns, key)) {
        throw new InvalidQueryError(`field not writable: ${key}`);
      }
    }
  }

  /** Row → entity: timestamps stay in the DB; a missing row means not found. */
  private mapRow(row: unknown): T {
    if (row === undefined) {
      throw new NotFoundError();
    }
    const entity = { ...(row as Record<string, unknown>) };
    delete entity.createdAt;
    delete entity.updatedAt;
    return entity as T;
  }
}
