import type { PageQuery } from '@repo/contracts';
import { Types, type Model, type QueryFilter, type UpdateQuery } from 'mongoose';
import { MAX_PAGE_LIMIT } from '../core/constants';
import { InvalidQueryError, NotFoundError } from '../core/errors';
import type { Filter, Paginated } from '../core/query';
import type { Repository } from '../core/repository';
import { mapMongoError } from './mongo-error.mapper';
import { MongoQueryTranslator } from './mongo-query.translator';
import { RESERVED_WRITE_KEYS } from './mongo.constants';
import type { MongoDocument } from './mongo.types';

export type { MongoDocument } from './mongo.types';

/** Rejects caller-supplied identity/`$`-operator keys on writes. */
function assertWritableKeys(data: object): void {
  for (const key of Object.keys(data)) {
    if (key.startsWith('$') || RESERVED_WRITE_KEYS.includes(key)) {
      throw new InvalidQueryError(`field not writable: ${key}`);
    }
  }
}

/**
 * Mongoose/MongoDB adapter for the `Repository<T>` port. All driver usage for
 * reads/writes lives here (AC-M04.9); feature code depends on the port only.
 */
export abstract class MongoRepository<T extends { id: string }> implements Repository<T> {
  private readonly translator: MongoQueryTranslator;

  constructor(
    private readonly model: Model<MongoDocument<T>>,
    allowedFields: readonly string[],
  ) {
    this.translator = new MongoQueryTranslator(allowedFields);
  }

  async findById(id: string): Promise<T> {
    const _id = this.toObjectId(id);
    const doc = await this.guard(() => this.model.findOne({ _id }).lean().exec());
    const mapped = this.mapDoc(doc);
    if (mapped === null) {
      throw new NotFoundError();
    }
    return mapped;
  }

  async findOne(filter: Filter): Promise<T | null> {
    const conditions = this.translator.translateFilter(filter);
    const doc = await this.guard(() => this.model.findOne(conditions).lean().exec());
    return this.mapDoc(doc);
  }

  async findMany(page: PageQuery, filter: Filter = []): Promise<Paginated<T>> {
    const conditions = this.translator.translateFilter(filter);
    const sort = this.translator.translateSort(page.sort);
    // PageQuery already caps the limit; clamp again defensively (AC-M04.2).
    const limit = Math.min(page.limit, MAX_PAGE_LIMIT);
    const skip = (page.page - 1) * limit;
    const [docs, total] = await this.guard(() =>
      Promise.all([
        this.model.find(conditions).sort(sort).skip(skip).limit(limit).lean().exec(),
        this.model.countDocuments(conditions).exec(),
      ]),
    );
    const items = docs.map((doc) => this.mapDoc(doc)).filter((item): item is T => item !== null);
    return { items, page: page.page, limit, total };
  }

  async create(data: Omit<T, 'id'>): Promise<T> {
    assertWritableKeys(data);
    const doc = await this.guard(() => this.model.create(data as Partial<MongoDocument<T>>));
    const mapped = this.mapDoc(doc.toObject());
    if (mapped === null) {
      // Unreachable: create() always returns the persisted document.
      throw new NotFoundError();
    }
    return mapped;
  }

  async update(id: string, patch: Partial<Omit<T, 'id'>>): Promise<T> {
    const _id = this.toObjectId(id);
    assertWritableKeys(patch);
    const doc = await this.guard(() =>
      this.model
        .findOneAndUpdate(
          { _id } as QueryFilter<MongoDocument<T>>,
          { $set: patch } as UpdateQuery<MongoDocument<T>>,
          { returnDocument: 'after', runValidators: true },
        )
        .lean()
        .exec(),
    );
    const mapped = this.mapDoc(doc);
    if (mapped === null) {
      throw new NotFoundError();
    }
    return mapped;
  }

  async delete(id: string): Promise<void> {
    const _id = this.toObjectId(id);
    const doc = await this.guard(() => this.model.findOneAndDelete({ _id }).lean().exec());
    if (doc === null) {
      throw new NotFoundError();
    }
  }

  async exists(id: string): Promise<boolean> {
    const _id = this.toObjectIdOrNull(id);
    if (_id === null) {
      return false;
    }
    const doc = await this.guard(() => this.model.exists({ _id }));
    return doc !== null;
  }

  /** Wraps a driver call so failures surface as core `DbError`s. */
  private async guard<R>(operation: () => Promise<R>): Promise<R> {
    try {
      return await operation();
    } catch (error) {
      throw mapMongoError(error);
    }
  }

  /** Strict ObjectId validation; malformed/invalid ids are 404s, never CastErrors. */
  private toObjectId(id: string): Types.ObjectId {
    const _id = this.toObjectIdOrNull(id);
    if (_id === null) {
      throw new NotFoundError();
    }
    return _id;
  }

  private toObjectIdOrNull(id: string): Types.ObjectId | null {
    if (typeof id !== 'string' || !Types.ObjectId.isValid(id)) {
      return null;
    }
    const objectId = new Types.ObjectId(id);
    return String(objectId) === id ? objectId : null;
  }

  /** Lean document → plain object with `id`, minus `_id`/`__v`. */
  private mapDoc(doc: unknown): T | null {
    if (doc === null || doc === undefined || typeof doc !== 'object') {
      return null;
    }
    const plain: Record<string, unknown> = { ...(doc as Record<string, unknown>) };
    const _id = plain._id as string | Types.ObjectId | undefined;
    delete plain._id;
    delete plain.__v;
    plain.id = _id === undefined ? undefined : String(_id);
    return plain as T;
  }
}
