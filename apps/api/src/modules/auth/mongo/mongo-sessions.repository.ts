import { Injectable, Inject } from '@nestjs/common';
import mongoose, { Types, type Connection } from 'mongoose';
import { NotFoundError } from '../../../infra/database/core/errors';
import type { Session } from '../auth.types';
import { SessionsRepository } from '../sessions.repository';
import { MONGO_CONNECTION } from '../../../infra/database/mongo/mongo.constants';
import { mapMongoError } from '../../../infra/database/mongo/mongo-error.mapper';
import { MongoRepository } from '../../../infra/database/mongo/mongo.repository';
import { getSessionModel } from './session.schema';

/** Lookups the port performs through the base `findOne` (all server-side). */
const SESSION_FIELDS = ['id', 'tokenHash', 'retiredTokenHashes', 'userId', 'familyId'] as const;

/** Lean document -> `Session` entity (identity in `id`, driver keys stripped). */
function toSession(doc: unknown): Session | null {
  if (doc === null || doc === undefined || typeof doc !== 'object') {
    return null;
  }
  const plain: Record<string, unknown> = { ...(doc as Record<string, unknown>) };
  const _id = plain._id as string | Types.ObjectId | undefined;
  delete plain._id;
  delete plain.__v;
  plain.id = _id === undefined ? undefined : String(_id);
  return plain as unknown as Session;
}

function toObjectIdOrNull(id: string): Types.ObjectId | null {
  if (typeof id !== 'string' || !Types.ObjectId.isValid(id)) {
    return null;
  }
  const objectId = new Types.ObjectId(id);
  return String(objectId) === id ? objectId : null;
}

/**
 * Mongo implementation of `SessionsRepository`. `rotate` is a single
 * `findOneAndUpdate`: the filter requires the session to be unrevoked and its
 * token hash to still differ from the new one, so exactly one of several
 * concurrent rotations can win (all others see zero matched documents).
 */
@Injectable()
export class MongoSessionsRepository
  extends MongoRepository<Session>
  implements SessionsRepository
{
  constructor(@Inject(MONGO_CONNECTION) connection: Connection) {
    super(getSessionModel(connection), SESSION_FIELDS);
  }

  findByTokenHash(tokenHash: string): Promise<Session | null> {
    return this.findOne([{ field: 'tokenHash', op: 'eq', value: tokenHash }]);
  }

  findByRetiredTokenHash(tokenHash: string): Promise<Session | null> {
    // `eq` on an array field matches any element (multikey index).
    return this.findOne([{ field: 'retiredTokenHashes', op: 'eq', value: tokenHash }]);
  }

  async rotate(
    id: string,
    expectedTokenHash: string,
    next: { tokenHash: string; expiresAt: Date },
    now: Date,
  ): Promise<Session | null> {
    const _id = toObjectIdOrNull(id);
    if (_id === null) {
      return null;
    }
    const doc = await this.runGuard(() =>
      this.model
        .findOneAndUpdate(
          // `updatePipeline: true` lets Mongoose accept the array (aggregation)
          // update form used for the atomic previous-hash capture.
          {
            _id,
            revokedAt: null,
            // Server-side comparison against the stored hash: a second, racing
            // rotation already moved it away and must not rotate again.
            tokenHash: expectedTokenHash,
          },
          // Pipeline form so `previousTokenHash` captures the old hash while
          // `tokenHash` moves to the new one in the same atomic write.
          [
            {
              $set: {
                previousTokenHash: '$tokenHash',
                retiredTokenHashes: {
                  $concatArrays: [{ $ifNull: ['$retiredTokenHashes', []] }, ['$tokenHash']],
                },
                tokenHash: next.tokenHash,
                expiresAt: next.expiresAt,
                rotatedAt: now,
              },
            },
          ],
          { returnDocument: 'after', updatePipeline: true },
        )
        .lean()
        .exec(),
    );
    return toSession(doc);
  }

  /**
   * Family head for the replay-grace path: the unrevoked session, preferring
   * the most recently rotated one. A family normally has at most one unrevoked
   * session; the sort makes the choice deterministic if a race left two.
   */
  async findActiveByFamily(familyId: string): Promise<Session | null> {
    const doc = await this.runGuard(() =>
      this.model
        .find({ familyId, revokedAt: null })
        .sort({ rotatedAt: -1, _id: -1 })
        .limit(1)
        .lean()
        .exec(),
    );
    return toSession(doc[0] ?? null);
  }

  async revoke(id: string, now: Date): Promise<void> {
    const _id = toObjectIdOrNull(id);
    if (_id === null) {
      throw new NotFoundError();
    }
    const doc = await this.runGuard(() =>
      this.model
        .findOneAndUpdate(
          { _id, revokedAt: null },
          { $set: { revokedAt: now } },
          { returnDocument: 'after' },
        )
        .lean()
        .exec(),
    );
    if (doc === null && !(await this.exists(id))) {
      throw new NotFoundError();
    }
  }

  async revokeFamily(familyId: string, now: Date): Promise<void> {
    await this.runGuard(() =>
      this.model.updateMany({ familyId, revokedAt: null }, { $set: { revokedAt: now } }).exec(),
    );
  }

  async revokeAllForUser(userId: string, now: Date): Promise<void> {
    await this.runGuard(() =>
      this.model.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: now } }).exec(),
    );
  }

  async deleteExpired(now: Date): Promise<number> {
    const result = await this.runGuard(() =>
      this.model
        .deleteMany({
          $or: [
            { expiresAt: mongoose.trusted({ $lt: now }) },
            { familyExpiresAt: mongoose.trusted({ $lt: now }) },
          ],
        })
        .exec(),
    );
    return result.deletedCount;
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
