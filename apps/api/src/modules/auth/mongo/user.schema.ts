import { Role, UserStatus } from '@repo/contracts/auth';
import { Schema, type Connection, type Model } from 'mongoose';
import type { MongoDocument } from '../../../infra/database/mongo/mongo.types';
import type { User } from '../auth.types';

export type UserDocument = MongoDocument<User>;

/**
 * Users collection schema. The e-mail is lowercased by Mongoose so uniqueness
 * is checked case-insensitively; the unique index is created by `syncIndexes`
 * (specs) or `db:sync-indexes` (deploy), never relied on in production boot.
 */
export function createUserSchema(): Schema<UserDocument> {
  return new Schema<UserDocument>({
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    roles: { type: [String], required: true, enum: Role.options },
    status: { type: String, required: true, enum: UserStatus.options },
    failedLoginCount: { type: Number, required: true, default: 0 },
    lockedUntil: { type: Date, default: null },
  });
}

/** Registers (or reuses) the `User` model on the given connection. */
export function getUserModel(connection: Connection): Model<UserDocument> {
  const existing = connection.models['User'] as Model<UserDocument> | undefined;
  return existing ?? connection.model<UserDocument>('User', createUserSchema());
}
