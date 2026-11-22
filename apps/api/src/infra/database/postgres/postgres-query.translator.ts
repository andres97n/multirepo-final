import { FilterOps } from '@repo/contracts';
import {
  and,
  arrayContains,
  asc,
  desc,
  eq,
  getTableColumns,
  gt,
  gte,
  ilike,
  inArray,
  lt,
  lte,
  ne,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { validate as isUuid } from 'uuid';
import { InvalidQueryError } from '../core/errors';
import type { Filter, FilterOp, FilterValue, QueryTranslator } from '../core/query';

/** Escapes LIKE wildcards (and the escape char itself) so `contains` is literal. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

type Scalar = string | number | boolean;
type ScalarKind = 'string' | 'number' | 'boolean';

/**
 * Translates the driver-agnostic `Filter`/sort strings of the core ports into
 * Drizzle expressions. Fields must be whitelisted per repository; operators
 * come from the fixed `FilterOps` list and every value reaches the driver as a
 * bound parameter through Drizzle operators — never raw SQL (AC-M05.6/7).
 */
export class PostgresQueryTranslator implements QueryTranslator<SQL | undefined, SQL[]> {
  private readonly columns: Record<string, PgColumn>;
  private readonly allowedFields: ReadonlySet<string>;

  constructor(table: PgTable, allowedFields: readonly string[]) {
    this.columns = getTableColumns(table);
    this.allowedFields = new Set(allowedFields);
  }

  translateFilter(filter: Filter): SQL | undefined {
    const clauses = filter.map((item) => {
      const column = this.column(item.field);
      this.assertOp(item.op);
      return this.buildClause(column, item.field === 'id', item.op, item.value);
    });
    return and(...clauses);
  }

  translateSort(sort: string | undefined): SQL[] {
    // Identity is always sortable, whether or not `id` is whitelisted for filters.
    const id = this.columns.id as PgColumn;
    if (sort === undefined) {
      // uuid v7 ids are time-ordered, so id order == creation order.
      return [asc(id)];
    }
    const separator = sort.indexOf(':');
    const field = separator > 0 ? sort.slice(0, separator) : '';
    const direction = separator > 0 ? sort.slice(separator + 1) : '';
    if (direction !== 'asc' && direction !== 'desc') {
      throw new InvalidQueryError(`invalid sort: ${sort}`);
    }
    const column = this.column(field);
    const ordered = direction === 'desc' ? desc(column) : asc(column);
    // `id` is always the tiebreaker so pagination order is stable.
    return field === 'id' ? [ordered] : [ordered, asc(id)];
  }

  private column(field: string): PgColumn {
    const column = this.allowedFields.has(field) ? this.columns[field] : undefined;
    if (column === undefined) {
      throw new InvalidQueryError(`field not allowed: ${field}`);
    }
    return column;
  }

  private assertOp(op: FilterOp): void {
    if (!(FilterOps as readonly string[]).includes(op)) {
      throw new InvalidQueryError(`unsupported operator: ${op}`);
    }
  }

  private buildClause(column: PgColumn, isId: boolean, op: FilterOp, value: FilterValue): SQL {
    const kind = column.dataType;
    if (kind === 'array') {
      if (op !== 'contains' || typeof value !== 'string') {
        throw new InvalidQueryError('array fields only support contains with a string value');
      }
      return arrayContains(column, [value]);
    }
    if (kind !== 'string' && kind !== 'number' && kind !== 'boolean') {
      throw new InvalidQueryError(`unsupported field type: ${kind}`);
    }
    const cast = (candidate: unknown): Scalar => this.cast(kind, isId, candidate);
    switch (op) {
      case 'eq':
        return eq(column, cast(value));
      case 'ne':
        return ne(column, cast(value));
      case 'gt':
        return gt(column, cast(value));
      case 'gte':
        return gte(column, cast(value));
      case 'lt':
        return lt(column, cast(value));
      case 'lte':
        return lte(column, cast(value));
      case 'in':
        if (!Array.isArray(value)) {
          throw new InvalidQueryError('in requires an array value');
        }
        // An empty IN list matches nothing (constant, no user input).
        return value.length === 0 ? sql`false` : inArray(column, value.map(cast));
      case 'contains':
        if (kind !== 'string' || isId || typeof value !== 'string') {
          throw new InvalidQueryError('contains requires a string field and value');
        }
        return ilike(column, `%${escapeLike(value)}%`);
    }
  }

  /** Strictly coerces a filter value to the column type; anything else is a 400. */
  private cast(kind: ScalarKind, isId: boolean, value: unknown): Scalar {
    if (kind === 'number') {
      const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
      if (typeof parsed === 'number' && Number.isFinite(parsed)) {
        return parsed;
      }
    } else if (kind === 'boolean') {
      if (typeof value === 'boolean') {
        return value;
      }
      if (value === 'true' || value === 'false') {
        return value === 'true';
      }
    } else if (typeof value === 'string' && (!isId || isUuid(value))) {
      return value;
    }
    throw new InvalidQueryError('value does not fit the field type');
  }
}
