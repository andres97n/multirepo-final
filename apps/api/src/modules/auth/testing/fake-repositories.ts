import { NotFoundError } from '../../../infra/database/core/errors';
import type { AuthClock } from '../auth.clock';
import type { LockoutPolicy, NewSession, Session, User } from '../auth.types';
import { SessionsRepository } from '../sessions.repository';
import { UsersRepository } from '../users.repository';

const DAY_MS = 86_400_000;

function cloneUser(user: User): User {
  return { ...user, roles: [...user.roles], lockedUntil: cloneDate(user.lockedUntil) };
}

function cloneSession(session: Session): Session {
  return {
    ...session,
    expiresAt: new Date(session.expiresAt),
    familyExpiresAt: new Date(session.familyExpiresAt),
    revokedAt: cloneDate(session.revokedAt),
    rotatedAt: cloneDate(session.rotatedAt),
  };
}

function cloneDate(date: Date | null): Date | null {
  return date === null ? null : new Date(date);
}

/**
 * Deterministic in-memory `UsersRepository` for unit specs. The lockout
 * ladder mirrors the adapters' atomic SQL/pipeline exactly
 * (`lockedUntil = now + min(base * 2^(count - threshold), max)`).
 */
export class FakeUsersRepository extends UsersRepository {
  readonly rows = new Map<string, User>();
  private nextId = 1;

  override findByEmail(email: string): Promise<User | null> {
    for (const user of this.rows.values()) {
      if (user.email === email) {
        return Promise.resolve(cloneUser(user));
      }
    }
    return Promise.resolve(null);
  }

  override create(data: Omit<User, 'id'>): Promise<User> {
    const user: User = { id: `user-${String(this.nextId++)}`, ...data };
    this.rows.set(user.id, user);
    return Promise.resolve(cloneUser(user));
  }

  override recordFailedLogin(id: string, lock: LockoutPolicy, now: Date): Promise<User> {
    const user = this.must(id);
    user.failedLoginCount += 1;
    if (user.failedLoginCount >= lock.threshold) {
      const seconds = Math.min(
        lock.baseSeconds * 2 ** (user.failedLoginCount - lock.threshold),
        lock.maxSeconds,
      );
      user.lockedUntil = new Date(now.getTime() + seconds * 1000);
    }
    return Promise.resolve(cloneUser(user));
  }

  override resetFailedLogins(id: string): Promise<User> {
    const user = this.must(id);
    user.failedLoginCount = 0;
    user.lockedUntil = null;
    return Promise.resolve(cloneUser(user));
  }

  override setPasswordHash(id: string, passwordHash: string): Promise<User> {
    const user = this.must(id);
    user.passwordHash = passwordHash;
    return Promise.resolve(cloneUser(user));
  }

  override list(): Promise<never> {
    throw new Error('FakeUsersRepository.list is not used by unit specs');
  }

  override findById(id: string): Promise<User> {
    const user = this.rows.get(id);
    if (user === undefined) {
      throw new NotFoundError();
    }
    return Promise.resolve(cloneUser(user));
  }

  /** Test helper: rewrite a stored row wholesale. */
  put(user: User): void {
    this.rows.set(user.id, user);
  }

  private must(id: string): User {
    const user = this.rows.get(id);
    if (user === undefined) {
      throw new NotFoundError();
    }
    return user;
  }
}

/**
 * Deterministic in-memory `SessionsRepository` for unit specs. `rotate`
 * enforces the same atomic rule as the adapters: unrevoked and stored hash
 * differs from the new one, otherwise null; `failNextRotate` scripts a lost
 * race.
 */
export class FakeSessionsRepository extends SessionsRepository {
  readonly rows = new Map<string, Session>();
  failNextRotate = false;
  private nextId = 1;

  override create(data: NewSession): Promise<Session> {
    const session: Session = { id: `session-${String(this.nextId++)}`, ...data };
    this.rows.set(session.id, session);
    return Promise.resolve(cloneSession(session));
  }

  override findByTokenHash(tokenHash: string): Promise<Session | null> {
    return Promise.resolve(this.find((session) => session.tokenHash === tokenHash));
  }

  override findByRetiredTokenHash(tokenHash: string): Promise<Session | null> {
    return Promise.resolve(this.find((session) => session.retiredTokenHashes.includes(tokenHash)));
  }

  override findById(id: string): Promise<Session> {
    const session = this.rows.get(id);
    if (session === undefined) {
      throw new NotFoundError();
    }
    return Promise.resolve(cloneSession(session));
  }

  override findActiveByFamily(familyId: string): Promise<Session | null> {
    return Promise.resolve(
      this.find((session) => session.familyId === familyId && session.revokedAt === null),
    );
  }

  override rotate(
    id: string,
    expectedTokenHash: string,
    next: { tokenHash: string; expiresAt: Date },
    now: Date,
  ): Promise<Session | null> {
    if (this.failNextRotate) {
      this.failNextRotate = false;
      return Promise.resolve(null);
    }
    const session = this.rows.get(id);
    if (
      session === undefined ||
      session.revokedAt !== null ||
      session.tokenHash !== expectedTokenHash
    ) {
      return Promise.resolve(null);
    }
    session.previousTokenHash = session.tokenHash;
    session.retiredTokenHashes = [...session.retiredTokenHashes, session.tokenHash];
    session.tokenHash = next.tokenHash;
    session.expiresAt = next.expiresAt;
    session.rotatedAt = now;
    return Promise.resolve(cloneSession(session));
  }

  override revoke(id: string, now: Date): Promise<void> {
    const session = this.rows.get(id);
    if (session === undefined) {
      throw new NotFoundError();
    }
    if (session.revokedAt === null) {
      session.revokedAt = now;
    }
    return Promise.resolve();
  }

  override revokeFamily(familyId: string, now: Date): Promise<void> {
    for (const session of this.rows.values()) {
      if (session.familyId === familyId && session.revokedAt === null) {
        session.revokedAt = now;
      }
    }
    return Promise.resolve();
  }

  override revokeAllForUser(userId: string, now: Date): Promise<void> {
    for (const session of this.rows.values()) {
      if (session.userId === userId && session.revokedAt === null) {
        session.revokedAt = now;
      }
    }
    return Promise.resolve();
  }

  override deleteExpired(now: Date): Promise<number> {
    let deleted = 0;
    for (const [id, session] of this.rows) {
      if (
        session.expiresAt.getTime() < now.getTime() ||
        session.familyExpiresAt.getTime() < now.getTime()
      ) {
        this.rows.delete(id);
        deleted += 1;
      }
    }
    return Promise.resolve(deleted);
  }

  private find(predicate: (session: Session) => boolean): Session | null {
    for (const session of this.rows.values()) {
      if (predicate(session)) {
        return cloneSession(session);
      }
    }
    return null;
  }
}

/** Clock whose time only moves when the test says so. */
export class ManualClock implements AuthClock {
  private current = new Date('2026-11-22T12:00:00.000Z');

  now(): Date {
    return new Date(this.current.getTime());
  }

  set(date: Date): void {
    this.current = new Date(date.getTime());
  }

  advanceMs(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }

  advanceDays(days: number): void {
    this.advanceMs(days * DAY_MS);
  }
}
