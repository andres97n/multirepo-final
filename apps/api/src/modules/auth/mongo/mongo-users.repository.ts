import type { PageQuery } from '@repo/contracts';
import { Injectable, Inject } from '@nestjs/common';
import { Types, type Connection, type UpdateQuery } from 'mongoose';
import { NotFoundError } from '../../../infra/database/core/errors';
import type { Filter, Paginated } from '../../../infra/database/core/query';
import { MONGO_CONNECTION } from '../../../infra/database/mongo/mongo.constants';
import { mapMongoError } from '../../../infra/database/mongo/mongo-error.mapper';
import { MongoRepository } from '../../../infra/database/mongo/mongo.repository';
import type { MongoDocument } from '../../../infra/database/mongo/mongo.types';
import type { LockoutPolicy, User } from '../auth.types';
import { UsersRepository } from '../users.repository';
import { getUserModel } from './user.schema';

/**
 * Filter/sort whitelist in model-path terms. The contract's `role` field is
 * translated to `roles` in `list()`; the base translator matches the array
 * path directly (equality on an array field means element membership).
 */
const USER_FIELDS = ['id', 'email', 'roles', 'status'] as const;

type UserDocument = MongoDocument<User>;

/** Lean document -> `User` entity (identity in `id`, driver keys stripped). */
function toUser(doc: unknown): User | null {
  if (doc === null || doc === undefined || typeof doc !== 'object') {
    return null;
  }
  const plain: Record<string, unknown> = { ...(doc as Record<string, unknown>) };
  const _id = plain._id as string | Types.ObjectId | undefined;
  delete plain._id;
  delete plain.__v;
  plain.id = _id === undefined ? undefined : String(_id);
  return plain as unknown as User;
}

/** Strict ObjectId round-trip check, mirroring the base adapter's id policy. */
function toObjectIdOrNull(id: string): Types.ObjectId | null {
  if (typeof id !== 'string' || !Types.ObjectId.isValid(id)) {
    return null;
  }
  const objectId = new Types.ObjectId(id);
  return String(objectId) === id ? objectId : null;
}

/**
 * Mongo implementation of `UsersRepository`. Mutations that must not race run
 * as single aggregation-pipeline updates so increments and lockout timestamps
 * are computed atomically server-side (no read-modify-write window).
 */
@Injectable()
export class MongoUsersRepository extends MongoRepository<User> implements UsersRepository {
  constructor(@Inject(MONGO_CONNECTION) connection: Connection) {
    super(getUserModel(connection), USER_FIELDS);
  }

  findByEmail(email: string): Promise<User | null> {
    return this.findOne([{ field: 'email', op: 'eq', value: email }]);
  }

  async recordFailedLogin(id: string, lock: LockoutPolicy, now: Date): Promise<User> {
    const _id = toObjectIdOrNull(id);
    if (_id === null) {
      throw new NotFoundError();
    }
    // Stage 1 increments; stage 2 then reads the incremented count (one $set
    // would evaluate every expression against the pre-update document).
    const stages: UpdateQuery<UserDocument> = [
      { $set: { failedLoginCount: { $add: ['$failedLoginCount', 1] } } },
      {
        $set: {
          lockedUntil: {
            $cond: [
              { $gte: ['$failedLoginCount', lock.threshold] },
              {
                $dateAdd: {
                  startDate: now,
                  unit: 'second',
                  amount: {
                    $min: [
                      {
                        $multiply: [
                          lock.baseSeconds,
                          { $pow: [2, { $subtract: ['$failedLoginCount', lock.threshold] }] },
                        ],
                      },
                      lock.maxSeconds,
                    ],
                  },
                },
              },
              '$lockedUntil',
            ],
          },
        },
      },
    ];
    const doc = await this.runGuard(() =>
      this.model
        .findOneAndUpdate({ _id }, stages, {
          returnDocument: 'after',
          updatePipeline: true,
        })
        .lean()
        .exec(),
    );
    const user = toUser(doc);
    if (user === null) {
      throw new NotFoundError();
    }
    return user;
  }

  async resetFailedLogins(id: string): Promise<User> {
    const _id = toObjectIdOrNull(id);
    if (_id === null) {
      throw new NotFoundError();
    }
    const doc = await this.runGuard(() =>
      this.model
        .findOneAndUpdate(
          { _id },
          { $set: { failedLoginCount: 0, lockedUntil: null } },
          { returnDocument: 'after', runValidators: true },
        )
        .lean()
        .exec(),
    );
    const user = toUser(doc);
    if (user === null) {
      throw new NotFoundError();
    }
    return user;
  }

  /** Login-time rehash: only the hash changes (core `update` keeps it atomic). */
  setPasswordHash(id: string, passwordHash: string): Promise<User> {
    return this.update(id, { passwordHash });
  }

  /**
   * Chosen translation (documented per plan): rename `role` -> `roles` here
   * instead of adding a Mongoose virtual, because array-path `$eq`/`$regex`
   * already match element membership, so values pass through unchanged.
   */
  list(page: PageQuery, filter: Filter): Promise<Paginated<User>> {
    const translated: Filter = filter.map((item) =>
      item.field === 'role' ? { ...item, field: 'roles' } : item,
    );
    return this.findMany(page, translated);
  }

  /** The base-class error guard is private; atomic operations wrap it here. */
  private async runGuard<R>(operation: () => Promise<R>): Promise<R> {
    try {
      return await operation();
    } catch (error) {
      throw mapMongoError(error);
    }
  }
}
