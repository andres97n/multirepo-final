import type { NewSession, Session } from './auth.types';

/**
 * Sessions persistence port (refresh-token families). Abstract class so it is
 * also the Nest DI token. Rotate/revoke run as single atomic statements:
 * concurrent rotations can never both succeed.
 */
export abstract class SessionsRepository {
  /** ConflictError(field: 'tokenHash') on duplicate token hash. */
  abstract create(data: NewSession): Promise<Session>;
  abstract findByTokenHash(tokenHash: string): Promise<Session | null>;
  /** Reuse lookup: the session that rotated away from `tokenHash` at any point. */
  abstract findByRetiredTokenHash(tokenHash: string): Promise<Session | null>;
  /** NotFoundError on missing or malformed id (same rule as the core port). */
  abstract findById(id: string): Promise<Session>;
  /**
   * Atomically rotates `id` to `next` (compare-and-swap): the update only
   * matches while the session is unrevoked and its current hash still equals
   * `expectedTokenHash` (the token the caller presented), so of N concurrent
   * refreshes exactly one wins. On success the old hash goes to
   * `previousTokenHash` and `retiredTokenHashes`, and `rotatedAt` records
   * `now`; a lost race returns null.
   */
  abstract rotate(
    id: string,
    expectedTokenHash: string,
    next: { tokenHash: string; expiresAt: Date },
    now: Date,
  ): Promise<Session | null>;
  /**
   * The head of a family: its unrevoked session (most recently rotated wins).
   * Null when the family is unknown, fully revoked or has no single head.
   * Added for the refresh replay-grace path (M06 slice 2).
   */
  abstract findActiveByFamily(familyId: string): Promise<Session | null>;
  /** NotFoundError if the session does not exist. */
  abstract revoke(id: string, now: Date): Promise<void>;
  abstract revokeFamily(familyId: string, now: Date): Promise<void>;
  abstract revokeAllForUser(userId: string, now: Date): Promise<void>;
  /** Removes sessions past their sliding or absolute expiry; returns the count. */
  abstract deleteExpired(now: Date): Promise<number>;
}
