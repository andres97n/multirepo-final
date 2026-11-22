import { FilterOps } from '@repo/contracts';
import mongoose, { Types } from 'mongoose';
import { InvalidQueryError } from '../core/errors';
import type { Filter, FilterOp, FilterValue, QueryTranslator } from '../core/query';
import type { MongoFilter, MongoSort } from './mongo.types';

/** Escapes every regex metacharacter so `contains` matches literal text only. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Strict ObjectId check: a 24-char hex string that round-trips through the
 * constructor unchanged (rejects numbers, 12-byte strings and other values
 * `ObjectId.isValid` is lenient about).
 */
function toStrictObjectId(value: unknown): Types.ObjectId | null {
  if (typeof value !== 'string' || !Types.ObjectId.isValid(value)) {
    return null;
  }
  const objectId = new Types.ObjectId(value);
  return String(objectId) === value ? objectId : null;
}

/**
 * Translates the driver-agnostic `Filter`/sort strings of the core ports into
 * Mongoose query conditions. Every field must be whitelisted per repository
 * (`id` maps to `_id`); operators come from the fixed `FilterOps` list, so
 * user input can never become a query operator (AC-M04.6 / AC-M04.8).
 *
 * Clauses are marked `mongoose.trusted()` because the adapter enables the
 * global `sanitizeFilter` option, which would otherwise wrap every operator
 * object in a literal `$eq` and break legitimate range/regex/in queries. The
 * whitelist in this translator is the injection guard; `sanitizeFilter` keeps
 * protecting anything that bypasses it.
 */
export class MongoQueryTranslator implements QueryTranslator<MongoFilter, MongoSort> {
  private readonly allowedFields: ReadonlySet<string>;

  constructor(allowedFields: readonly string[]) {
    this.allowedFields = new Set(allowedFields);
  }

  translateFilter(filter: Filter): MongoFilter {
    const out: MongoFilter = {};
    for (const item of filter) {
      if (!this.allowedFields.has(item.field)) {
        throw new InvalidQueryError(`field not allowed: ${item.field}`);
      }
      const op = this.assertOp(item.op);
      const clause = this.buildClause(item.field, op, item.value);
      const key = item.field === 'id' ? '_id' : item.field;
      const existing = out[key];
      if (existing !== null && typeof existing === 'object' && !Array.isArray(existing)) {
        Object.assign(existing, clause);
      } else {
        out[key] = clause;
      }
    }
    for (const key of Object.keys(out)) {
      out[key] = mongoose.trusted(out[key] as Record<string, unknown>);
    }
    return out;
  }

  translateSort(sort: string | undefined): MongoSort {
    if (sort === undefined) {
      return { _id: 1 };
    }
    const separator = sort.indexOf(':');
    const field = separator > 0 ? sort.slice(0, separator) : '';
    const direction = separator > 0 ? sort.slice(separator + 1) : '';
    if (direction !== 'asc' && direction !== 'desc') {
      throw new InvalidQueryError(`invalid sort: ${sort}`);
    }
    if (!this.allowedFields.has(field)) {
      throw new InvalidQueryError(`field not allowed: ${field}`);
    }
    const order: 1 | -1 = direction === 'desc' ? -1 : 1;
    // `_id` is always the tiebreaker so pagination order is stable.
    return field === 'id' ? { _id: order } : { [field]: order, _id: 1 };
  }

  private assertOp(op: FilterOp): FilterOp {
    if (!(FilterOps as readonly string[]).includes(op)) {
      throw new InvalidQueryError(`unsupported operator: ${op}`);
    }
    return op;
  }

  private buildClause(field: string, op: FilterOp, value: FilterValue): MongoFilter {
    if (field === 'id') {
      return this.buildIdClause(op, value);
    }
    switch (op) {
      case 'eq':
        // Always wrapped in `$eq` (never a bare object), and object values are
        // rejected: { "$gt": "" } is never an operator and never reaches the
        // driver, where it would be a cast error (AC-M04.6).
        this.assertNotObject(value, op);
        return { $eq: value };
      case 'ne':
        this.assertNotObject(value, op);
        return { $ne: value };
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte':
        this.assertScalar(value, op);
        return { [`$${op}`]: value };
      case 'in':
        if (!Array.isArray(value)) {
          throw new InvalidQueryError('in requires an array value');
        }
        return { $in: value };
      case 'contains':
        if (typeof value !== 'string') {
          throw new InvalidQueryError('contains requires a string value');
        }
        return { $regex: escapeRegex(value), $options: 'i' };
    }
  }

  private buildIdClause(op: FilterOp, value: FilterValue): MongoFilter {
    const castId = (candidate: unknown): Types.ObjectId => {
      const objectId = toStrictObjectId(candidate);
      if (objectId === null) {
        throw new InvalidQueryError('invalid id value');
      }
      return objectId;
    };
    switch (op) {
      case 'eq':
        return { $eq: castId(value) };
      case 'ne':
        return { $ne: castId(value) };
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte':
        this.assertScalar(value, op);
        return { [`$${op}`]: castId(value) };
      case 'in':
        if (!Array.isArray(value)) {
          throw new InvalidQueryError('in requires an array value');
        }
        return { $in: value.map(castId) };
      case 'contains':
        if (typeof value !== 'string') {
          throw new InvalidQueryError('contains requires a string value');
        }
        castId(value);
        return { $regex: escapeRegex(value), $options: 'i' };
    }
  }

  private assertNotObject(value: FilterValue, op: FilterOp): void {
    if (typeof value === 'object' && !Array.isArray(value)) {
      throw new InvalidQueryError(`${op} does not accept object values`);
    }
  }

  private assertScalar(value: FilterValue, op: FilterOp): void {
    const type = typeof value;
    if (type !== 'string' && type !== 'number' && type !== 'boolean') {
      throw new InvalidQueryError(`${op} requires a scalar value`);
    }
  }
}
