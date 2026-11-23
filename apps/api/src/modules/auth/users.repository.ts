import type { PageQuery } from '@repo/contracts';
import type { Filter, Paginated } from '../../infra/database/core/query';
import type { LockoutPolicy, User } from './auth.types';

/**
 * Users persistence port. An abstract class (not an interface) so it doubles
 * as the Nest DI token; each engine adapter binds itself to it
 * (`{ provide: UsersRepository, useFactory: ... }`).
 *
 * Error contract (identical on every adapter):
 * - missing or malformed ids raise `NotFoundError`;
 * - duplicate e-mail on `create` raises `ConflictError('email')`;
 * - non-whitelisted filter/sort fields raise `InvalidQueryError`.
 */
export abstract class UsersRepository {
  /** Null for unknown e-mails (login must not distinguish them). */
  abstract findByEmail(email: string): Promise<User | null>;
  /** ConflictError(field: 'email') on duplicate e-mail. */
  abstract create(data: Omit<User, 'id'>): Promise<User>;
  /**
   * Atomically increments `failedLoginCount` and, once the new count reaches
   * `threshold`, sets `lockedUntil = now + min(base * 2^(count - threshold), max)`
   * seconds. `now` is injected so the ladder is testable without sleeping.
   */
  abstract recordFailedLogin(id: string, lock: LockoutPolicy, now: Date): Promise<User>;
  /** Clears the counter and any active lock after a successful login. */
  abstract resetFailedLogins(id: string): Promise<User>;
  /**
   * Overwrites the stored password hash (used by login-time rehash when the
   * recorded Argon2 parameters are weaker than the current config).
   * NotFoundError on missing or malformed id.
   */
  abstract setPasswordHash(id: string, passwordHash: string): Promise<User>;
  /**
   * Admin listing. `filter` fields come from the `UsersQuery` contract:
   * `email`, `role` (membership of the roles array) and `status`;
   * everything else is an `InvalidQueryError`.
   */
  abstract list(page: PageQuery, filter: Filter): Promise<Paginated<User>>;
  /** NotFoundError on missing or malformed id. */
  abstract findById(id: string): Promise<User>;
}
