import { Schema, type Connection, type Model } from 'mongoose';
import type { MongoDocument } from '../../../infra/database/mongo/mongo.types';
import type { Session } from '../auth.types';

export type SessionDocument = MongoDocument<Session>;

/**
 * Sessions collection schema: `tokenHash` is unique (each refresh token maps
 * to exactly one row) and `userId`/`familyId` are indexed for the bulk revoke
 * and cleanup paths.
 */
export function createSessionSchema(): Schema<SessionDocument> {
  return new Schema<SessionDocument>({
    userId: { type: String, required: true, index: true },
    familyId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    familyExpiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    replacedBy: { type: String, default: null },
    previousTokenHash: { type: String, default: null },
    retiredTokenHashes: { type: [String], default: [], index: true },
    rotatedAt: { type: Date, default: null },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
  });
}

/** Registers (or reuses) the `Session` model on the given connection. */
export function getSessionModel(connection: Connection): Model<SessionDocument> {
  const existing = connection.models['Session'] as Model<SessionDocument> | undefined;
  return existing ?? connection.model<SessionDocument>('Session', createSessionSchema());
}
