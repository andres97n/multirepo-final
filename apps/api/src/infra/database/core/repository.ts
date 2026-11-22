import type { PageQuery } from '@repo/contracts';
import type { Filter, Paginated } from './query';

/**
 * The persistence port every feature repository depends on. Adapters implement
 * it; feature code never imports a driver (AC-M04.9 / AC-M04.10).
 */
export interface Repository<T, Id = string> {
  /** Throws NotFoundError (missing OR malformed id). */
  findById(id: Id): Promise<T>;
  findOne(filter: Filter): Promise<T | null>;
  findMany(page: PageQuery, filter?: Filter): Promise<Paginated<T>>;
  /** ConflictError(field) on unique violation. */
  create(data: Omit<T, 'id'>): Promise<T>;
  /** NotFoundError if missing/malformed. */
  update(id: Id, patch: Partial<Omit<T, 'id'>>): Promise<T>;
  /** NotFoundError if missing/malformed. */
  delete(id: Id): Promise<void>;
  /** false for missing/malformed, never throws NotFound. */
  exists(id: Id): Promise<boolean>;
}
