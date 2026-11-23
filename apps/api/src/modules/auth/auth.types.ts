import type { Role, UserStatus } from '@repo/contracts/auth';

/**
 * A persisted user. It deliberately has no `createdAt`/`updatedAt` fields:
 * the Postgres adapter strips them in `mapRow`, so an entity type that
 * carried them would lie on that engine.
 */
export interface User {
  id: string;
  /** Lowercased e-mail; unique (ConflictError on duplicate). */
  email: string;
  passwordHash: string;
  roles: Role[];
  status: UserStatus;
  failedLoginCount: number;
  /** Set while a progressive lockout is active; null otherwise. */
  lockedUntil: Date | null;
}

/**
 * One refresh-token session. Sessions belong to a `familyId` (all sessions
 * minted since a login until reuse revokes the family). `previousTokenHash`
 * and `rotatedAt` implement the bounded post-rotation replay-grace window.
 */
export interface Session {
  id: string;
  userId: string;
  familyId: string;
  /** SHA-256 hex of the opaque refresh token; unique. */
  tokenHash: string;
  /** Sliding expiry: extended on every refresh. */
  expiresAt: Date;
  /** Absolute expiry: never extended (family cap). */
  familyExpiresAt: Date;
  revokedAt: Date | null;
  /** Id of the session that replaced this one on rotation; null until then. */
  replacedBy: string | null;
  /** Token hash held before the last rotation (replay-grace lookup). */
  previousTokenHash: string | null;
  /**
   * Every hash this session rotated away from, oldest first. Presenting any of
   * them is token reuse (AC-M06.3). ponytail: grows by one per refresh, bounded
   * by the 30-day family cap; prune or move to a table if refresh volume is high.
   */
  retiredTokenHashes: string[];
  rotatedAt: Date | null;
  ip: string | null;
  userAgent: string | null;
}

/** Progressive-lockout parameters (`LOCKOUT_*` env) passed to `recordFailedLogin`. */
export interface LockoutPolicy {
  threshold: number;
  baseSeconds: number;
  maxSeconds: number;
}

/** Data accepted by `SessionsRepository.create` (id is adapter-generated). */
export type NewSession = Omit<Session, 'id'>;

/**
 * `req.user` attached by `JwtAuthGuard` after a successful access-token and
 * revocation check.
 */
export interface AuthUser {
  /** User id (the JWT `sub` claim). */
  id: string;
  roles: Role[];
  /** Session id (the JWT `sid` claim); revocation is tracked per session. */
  sid: string;
}

/** Request context stored on a session (client ip and user-agent). */
export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}
