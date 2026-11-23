import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { v7 as uuidv7 } from 'uuid';
import {
  ConflictError,
  InvalidQueryError,
  NotFoundError,
} from '../../../infra/database/core/errors';
import type { Repository } from '../../../infra/database/core/repository';
import type { LockoutPolicy, NewSession, Session, User } from '../auth.types';
import type { SessionsRepository } from '../sessions.repository';
import type { UsersRepository } from '../users.repository';

/**
 * The engine specs pass their concrete repositories: the auth port methods for
 * behaviour, plus the core `Repository` surface used for test isolation
 * (`delete`/`findMany`, exactly like the M04 contract suite wipes through).
 */
export interface AuthRepositoryContractResult {
  users: UsersRepository & Repository<User>;
  sessions: SessionsRepository & Repository<Session>;
  cleanup: () => Promise<void>;
}

/** The defaults from `auth.env.ts` the port's atomic behaviour is defined by. */
const LOCK: LockoutPolicy = { threshold: 5, baseSeconds: 60, maxSeconds: 900 };
/** Every ladder assertion uses this injected instant; nothing sleeps. */
const NOW = new Date('2026-11-22T12:00:00.000Z');

const seconds = (n: number, from: Date = NOW): Date => new Date(from.getTime() + n * 1000);
const days = (n: number, from: Date = NOW): Date => new Date(from.getTime() + n * 86_400_000);
const randomHash = (): string => `${uuidv7()}${uuidv7()}`.replaceAll('-', '');

function userData(overrides: Partial<Omit<User, 'id'>> = {}): Omit<User, 'id'> {
  return {
    email: `user-${uuidv7()}@example.com`,
    passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$test-hash',
    roles: ['user'],
    status: 'active',
    failedLoginCount: 0,
    lockedUntil: null,
    ...overrides,
  };
}

function sessionData(userId: string, overrides: Partial<NewSession> = {}): NewSession {
  return {
    userId,
    familyId: uuidv7(),
    tokenHash: randomHash(),
    expiresAt: days(7),
    familyExpiresAt: days(30),
    revokedAt: null,
    replacedBy: null,
    previousTokenHash: null,
    retiredTokenHashes: [],
    rotatedAt: null,
    ip: '203.0.113.10',
    userAgent: 'vitest',
    ...overrides,
  };
}

async function rejected(promise: Promise<unknown>): Promise<unknown> {
  return promise.catch((error: unknown) => error);
}

/**
 * Auth-specific repository contract (M06 extension of the AC-M04.1 idea):
 * one set of cases shared verbatim by the Mongo and Postgres engine specs so
 * both adapters are proven to behave identically on the atomic operations.
 */
export function runAuthRepositoryContract(
  name: string,
  factory: () => Promise<AuthRepositoryContractResult>,
): void {
  describe(`auth repositories contract: ${name}`, () => {
    let ctx: AuthRepositoryContractResult;

    beforeAll(async () => {
      ctx = await factory();
    });

    afterAll(async () => {
      await ctx.cleanup();
    });

    /** Wipes both collections through the shared core port surface. */
    beforeEach(async () => {
      // Far-future `now` makes every session "expired", so this is delete-all.
      await ctx.sessions.deleteExpired(new Date(NOW.getTime() + 365 * 86_400_000));
      for (;;) {
        const page = await ctx.users.list({ page: 1, limit: 100 }, []);
        if (page.items.length === 0) {
          return;
        }
        for (const user of page.items) {
          await ctx.users.delete(user.id);
        }
      }
    });

    describe('users', () => {
      it('creates and reads back by id and email; misses return null or NotFoundError', async () => {
        const email = `roundtrip-${uuidv7()}@example.com`;
        const created = await ctx.users.create(userData({ email }));
        expect(typeof created.id).toBe('string');
        expect(created.id.length).toBeGreaterThan(0);
        expect(created).not.toHaveProperty('createdAt');
        expect(created).not.toHaveProperty('updatedAt');
        expect(created.email).toBe(email);
        expect(created.lockedUntil).toBeNull();

        expect(await ctx.users.findById(created.id)).toEqual(created);
        expect((await ctx.users.findByEmail(email))?.id).toBe(created.id);
        expect(await ctx.users.findByEmail(`missing-${uuidv7()}@example.com`)).toBeNull();

        expect(await rejected(ctx.users.findById('not-an-id'))).toBeInstanceOf(NotFoundError);
        expect(await rejected(ctx.users.findById(uuidv7()))).toBeInstanceOf(NotFoundError);
      });

      it('maps a duplicate email to ConflictError(field: "email")', async () => {
        const created = await ctx.users.create(userData());
        const error = await rejected(ctx.users.create(userData({ email: created.email })));
        expect(error).toBeInstanceOf(ConflictError);
        expect((error as ConflictError).field).toBe('email');
      });

      it('applies the lockout ladder atomically: 60 s, 120 s, 240 s ... capped at 900 s', async () => {
        const created = await ctx.users.create(userData());

        for (let failures = 1; failures <= 4; failures++) {
          const updated = await ctx.users.recordFailedLogin(created.id, LOCK, NOW);
          expect(updated.failedLoginCount).toBe(failures);
          expect(updated.lockedUntil).toBeNull();
        }

        const ladder = new Map<number, number>([
          [5, 60],
          [6, 120],
          [7, 240],
          [8, 480],
          [9, 900],
          [10, 900],
        ]);
        for (const [failures, lockSeconds] of ladder) {
          const updated = await ctx.users.recordFailedLogin(created.id, LOCK, NOW);
          expect(updated.failedLoginCount).toBe(failures);
          expect(updated.lockedUntil?.getTime(), `${String(failures)} failures`).toBe(
            seconds(lockSeconds).getTime(),
          );
        }

        const persisted = await ctx.users.findById(created.id);
        expect(persisted.failedLoginCount).toBe(10);
        expect(await rejected(ctx.users.recordFailedLogin('not-an-id', LOCK, NOW))).toBeInstanceOf(
          NotFoundError,
        );
      });

      it('resets the counter and the lock on successful logins', async () => {
        const created = await ctx.users.create(userData());
        for (let failures = 0; failures < 5; failures++) {
          await ctx.users.recordFailedLogin(created.id, LOCK, NOW);
        }
        const reset = await ctx.users.resetFailedLogins(created.id);
        expect(reset.failedLoginCount).toBe(0);
        expect(reset.lockedUntil).toBeNull();

        const persisted = await ctx.users.findById(created.id);
        expect(persisted.failedLoginCount).toBe(0);
        expect(persisted.lockedUntil).toBeNull();

        // The ladder restarts from scratch after a success.
        const nextFailure = await ctx.users.recordFailedLogin(created.id, LOCK, NOW);
        expect(nextFailure.failedLoginCount).toBe(1);
        expect(nextFailure.lockedUntil).toBeNull();

        expect(await rejected(ctx.users.resetFailedLogins('not-an-id'))).toBeInstanceOf(
          NotFoundError,
        );
      });

      it('setPasswordHash replaces only the hash, and bad ids are NotFoundError', async () => {
        const created = await ctx.users.create(userData());
        const updated = await ctx.users.setPasswordHash(
          created.id,
          '$argon2id$v=19$m=65536,t=3,p=4$other-hash',
        );
        expect(updated.passwordHash).toBe('$argon2id$v=19$m=65536,t=3,p=4$other-hash');
        expect(updated.email).toBe(created.email);
        expect(updated.roles).toEqual(created.roles);
        const persisted = await ctx.users.findById(created.id);
        expect(persisted.passwordHash).toBe('$argon2id$v=19$m=65536,t=3,p=4$other-hash');

        expect(
          await rejected(ctx.users.setPasswordHash('not-an-id', '$argon2id$x')),
        ).toBeInstanceOf(NotFoundError);
        expect(await rejected(ctx.users.setPasswordHash(uuidv7(), '$argon2id$x'))).toBeInstanceOf(
          NotFoundError,
        );
      });

      it('lists users with pagination and the contract filters, and rejects other fields', async () => {
        const admins = [
          await ctx.users.create(
            userData({ email: `alice-${uuidv7()}@example.com`, roles: ['admin'] }),
          ),
          await ctx.users.create(
            userData({ email: `amy-${uuidv7()}@example.com`, roles: ['admin', 'user'] }),
          ),
        ];
        const bob = await ctx.users.create(
          userData({ email: `bob-${uuidv7()}@example.com`, status: 'disabled' }),
        );

        const all = await ctx.users.list({ page: 1, limit: 10 }, []);
        expect(all.total).toBe(3);
        expect(all.page).toBe(1);
        expect(all.limit).toBe(10);
        expect(all.items.map((item) => item.id).sort()).toEqual(
          [...admins, bob].map((item) => item.id).sort(),
        );
        for (const item of all.items) {
          expect(item).not.toHaveProperty('createdAt');
        }

        const byEmail = await ctx.users.list({ page: 1, limit: 10 }, [
          { field: 'email', op: 'contains', value: 'amy-' },
        ]);
        expect(byEmail.items.map((item) => item.id)).toEqual([admins[1]?.id]);
        expect(byEmail.total).toBe(1);

        const byRole = await ctx.users.list({ page: 1, limit: 10 }, [
          { field: 'role', op: 'eq', value: 'admin' },
        ]);
        expect(byRole.items.map((item) => item.id).sort()).toEqual(admins.map((u) => u.id).sort());
        expect(byRole.total).toBe(2);

        const byStatus = await ctx.users.list({ page: 1, limit: 10 }, [
          { field: 'status', op: 'eq', value: 'disabled' },
        ]);
        expect(byStatus.items.map((item) => item.id)).toEqual([bob.id]);
        expect(byStatus.total).toBe(1);

        // Non-whitelisted fields (and anything outside the contract spec) are 400s.
        expect(
          await rejected(
            ctx.users.list({ page: 1, limit: 10 }, [
              { field: 'passwordHash', op: 'eq', value: 'x' },
            ]),
          ),
        ).toBeInstanceOf(InvalidQueryError);
        expect(
          await rejected(
            ctx.users.list({ page: 1, limit: 10 }, [{ field: 'lockedUntil', op: 'lt', value: 1 }]),
          ),
        ).toBeInstanceOf(InvalidQueryError);
      });

      it('paginates without overlap or gaps', async () => {
        for (let i = 0; i < 5; i++) {
          await ctx.users.create(userData());
        }
        const first = await ctx.users.list({ page: 1, limit: 2 }, []);
        const second = await ctx.users.list({ page: 2, limit: 2 }, []);
        const third = await ctx.users.list({ page: 3, limit: 2 }, []);
        expect([first.items.length, second.items.length, third.items.length]).toEqual([2, 2, 1]);
        const ids = [...first.items, ...second.items, ...third.items].map((item) => item.id);
        expect(new Set(ids).size).toBe(5);
        expect(first.total).toBe(5);
      });
    });

    describe('sessions', () => {
      async function createUserWithSession(overrides: Partial<NewSession> = {}): Promise<{
        user: User;
        session: Session;
      }> {
        const user = await ctx.users.create(userData());
        const session = await ctx.sessions.create(sessionData(user.id, overrides));
        return { user, session };
      }

      it('creates and finds sessions by tokenHash, retiredTokenHash and id', async () => {
        const { user, session } = await createUserWithSession();
        expect(typeof session.id).toBe('string');
        expect(session.userId).toBe(user.id);
        expect(session.revokedAt).toBeNull();
        expect(session.previousTokenHash).toBeNull();

        expect((await ctx.sessions.findByTokenHash(session.tokenHash))?.id).toBe(session.id);
        expect(await ctx.sessions.findByTokenHash('deadbeef')).toBeNull();
        expect(await ctx.sessions.findByRetiredTokenHash(session.tokenHash)).toBeNull();
        expect((await ctx.sessions.findById(session.id)).id).toBe(session.id);
        expect(await rejected(ctx.sessions.findById('not-an-id'))).toBeInstanceOf(NotFoundError);
      });

      it('maps a duplicate tokenHash to ConflictError(field: "tokenHash")', async () => {
        const { user, session } = await createUserWithSession();
        const error = await rejected(
          ctx.sessions.create(sessionData(user.id, { tokenHash: session.tokenHash })),
        );
        expect(error).toBeInstanceOf(ConflictError);
        expect((error as ConflictError).field).toBe('tokenHash');
      });

      it('rotates atomically: keeps the old hash for the grace window, loser gets null', async () => {
        const { session } = await createUserWithSession();
        const next = { tokenHash: randomHash(), expiresAt: days(7, seconds(60)) };

        const rotated = await ctx.sessions.rotate(session.id, session.tokenHash, next, NOW);
        expect(rotated).not.toBeNull();
        expect(rotated?.tokenHash).toBe(next.tokenHash);
        expect(rotated?.previousTokenHash).toBe(session.tokenHash);
        expect(rotated?.rotatedAt?.getTime()).toBe(NOW.getTime());
        expect(rotated?.expiresAt.getTime()).toBe(next.expiresAt.getTime());
        expect(rotated?.revokedAt).toBeNull();
        expect((await ctx.sessions.findByTokenHash(next.tokenHash))?.id).toBe(session.id);
        expect(rotated?.retiredTokenHashes).toEqual([session.tokenHash]);
        // Reuse lookup finds the session through the rotated-away hash.
        expect((await ctx.sessions.findByRetiredTokenHash(session.tokenHash))?.id).toBe(session.id);

        // Presenting the stale hash again must lose (null): compare-and-swap.
        expect(await ctx.sessions.rotate(session.id, session.tokenHash, next, NOW)).toBeNull();
        // Concurrent refreshes of the same token each mint a DIFFERENT next
        // hash; exactly one may win.
        const racers = await Promise.all(
          [randomHash(), randomHash(), randomHash()].map((tokenHash) =>
            ctx.sessions.rotate(session.id, next.tokenHash, { tokenHash, expiresAt: days(8) }, NOW),
          ),
        );
        expect(racers.filter((result) => result !== null)).toHaveLength(1);
      });

      it('remembers every retired hash across several rotations (reuse detection)', async () => {
        const { session } = await createUserWithSession();
        const hashes = [session.tokenHash, randomHash(), randomHash(), randomHash()];
        for (let i = 1; i < hashes.length; i++) {
          const rotated = await ctx.sessions.rotate(
            session.id,
            hashes[i - 1] ?? '',
            { tokenHash: hashes[i] ?? '', expiresAt: days(8) },
            NOW,
          );
          expect(rotated).not.toBeNull();
        }
        for (const retired of hashes.slice(0, -1)) {
          expect((await ctx.sessions.findByRetiredTokenHash(retired))?.id).toBe(session.id);
        }
        // The live hash is not retired; unknown hashes are not found.
        expect(await ctx.sessions.findByRetiredTokenHash(hashes[3] ?? '')).toBeNull();
        expect(await ctx.sessions.findByRetiredTokenHash(randomHash())).toBeNull();
      });

      it('refuses to rotate revoked or unknown sessions and handles bad ids', async () => {
        const { session } = await createUserWithSession();
        await ctx.sessions.revoke(session.id, NOW);
        expect(
          await ctx.sessions.rotate(
            session.id,
            session.tokenHash,
            { tokenHash: randomHash(), expiresAt: days(8) },
            NOW,
          ),
        ).toBeNull();
        expect(
          await ctx.sessions.rotate(
            uuidv7(),
            randomHash(),
            { tokenHash: randomHash(), expiresAt: days(8) },
            NOW,
          ),
        ).toBeNull();
        expect(
          await ctx.sessions.rotate(
            'not-an-id',
            randomHash(),
            { tokenHash: randomHash(), expiresAt: days(8) },
            NOW,
          ),
        ).toBeNull();
      });

      it('revokes one session and is idempotent; unknown ids are NotFoundError', async () => {
        const { session } = await createUserWithSession();
        await ctx.sessions.revoke(session.id, NOW);
        expect((await ctx.sessions.findById(session.id)).revokedAt?.getTime()).toBe(NOW.getTime());

        // Revoking again keeps the original timestamp and does not throw.
        await ctx.sessions.revoke(session.id, seconds(10));
        expect((await ctx.sessions.findById(session.id)).revokedAt?.getTime()).toBe(NOW.getTime());

        expect(await rejected(ctx.sessions.revoke(uuidv7(), NOW))).toBeInstanceOf(NotFoundError);
        expect(await rejected(ctx.sessions.revoke('not-an-id', NOW))).toBeInstanceOf(NotFoundError);
      });

      it('revokeFamily revokes only that family', async () => {
        const user = await ctx.users.create(userData());
        const otherUser = await ctx.users.create(userData());
        const family = uuidv7();
        const otherFamily = uuidv7();

        const inFamily = [
          await ctx.sessions.create(sessionData(user.id, { familyId: family })),
          await ctx.sessions.create(sessionData(user.id, { familyId: family })),
        ];
        const ownOther = await ctx.sessions.create(sessionData(user.id, { familyId: otherFamily }));
        const foreign = await ctx.sessions.create(sessionData(otherUser.id, { familyId: family }));
        const survivor = await ctx.sessions.create(
          sessionData(otherUser.id, { familyId: uuidv7() }),
        );
        // A pre-revoked sibling must keep its original timestamp.
        const dead = await ctx.sessions.create(
          sessionData(user.id, { familyId: family, revokedAt: seconds(-60) }),
        );

        await ctx.sessions.revokeFamily(family, NOW);

        for (const session of [...inFamily, foreign]) {
          expect((await ctx.sessions.findById(session.id)).revokedAt?.getTime()).toBe(
            NOW.getTime(),
          );
        }
        expect((await ctx.sessions.findById(ownOther.id)).revokedAt).toBeNull();
        expect((await ctx.sessions.findById(survivor.id)).revokedAt).toBeNull();
        expect((await ctx.sessions.findById(dead.id)).revokedAt?.getTime()).toBe(
          seconds(-60).getTime(),
        );
      });

      it('revokeAllForUser revokes every session of that user only', async () => {
        const user = await ctx.users.create(userData());
        const other = await ctx.users.create(userData());
        const mine = [
          await ctx.sessions.create(sessionData(user.id)),
          await ctx.sessions.create(sessionData(user.id)),
        ];
        const theirs = await ctx.sessions.create(sessionData(other.id));

        await ctx.sessions.revokeAllForUser(user.id, NOW);

        for (const session of mine) {
          expect((await ctx.sessions.findById(session.id)).revokedAt?.getTime()).toBe(
            NOW.getTime(),
          );
        }
        expect((await ctx.sessions.findById(theirs.id)).revokedAt).toBeNull();
      });

      it('findActiveByFamily returns the unrevoked head, preferring the rotated row', async () => {
        const { session } = await createUserWithSession();
        expect((await ctx.sessions.findActiveByFamily(session.familyId))?.id).toBe(session.id);

        const rotated = await ctx.sessions.rotate(
          session.id,
          session.tokenHash,
          { tokenHash: randomHash(), expiresAt: days(8) },
          NOW,
        );
        expect(rotated).not.toBeNull();
        expect((await ctx.sessions.findActiveByFamily(session.familyId))?.id).toBe(session.id);

        // A fully revoked family has no head; unknown families are null too.
        await ctx.sessions.revokeFamily(session.familyId, NOW);
        expect(await ctx.sessions.findActiveByFamily(session.familyId)).toBeNull();
        expect(await ctx.sessions.findActiveByFamily(uuidv7())).toBeNull();
        expect(await ctx.sessions.findActiveByFamily('not-an-id')).toBeNull();
      });

      it('deleteExpired removes only expired rows and reports the count', async () => {
        const user = await ctx.users.create(userData());
        const slidingExpired = await ctx.sessions.create(
          sessionData(user.id, { expiresAt: seconds(-1), familyExpiresAt: days(30) }),
        );
        const familyExpired = await ctx.sessions.create(
          sessionData(user.id, { expiresAt: days(7), familyExpiresAt: seconds(-1) }),
        );
        const alive = await ctx.sessions.create(
          sessionData(user.id, { expiresAt: days(7), familyExpiresAt: days(30) }),
        );
        // Revoked sessions are not special for cleanup: expired + revoked goes.
        const revokedExpired = await ctx.sessions.create(
          sessionData(user.id, { expiresAt: seconds(-2), revokedAt: NOW }),
        );

        expect(await ctx.sessions.deleteExpired(NOW)).toBe(3);
        expect(await rejected(ctx.sessions.findById(slidingExpired.id))).toBeInstanceOf(
          NotFoundError,
        );
        expect(await rejected(ctx.sessions.findById(familyExpired.id))).toBeInstanceOf(
          NotFoundError,
        );
        expect(await rejected(ctx.sessions.findById(revokedExpired.id))).toBeInstanceOf(
          NotFoundError,
        );
        expect((await ctx.sessions.findById(alive.id)).id).toBe(alive.id);
        expect(await ctx.sessions.deleteExpired(NOW)).toBe(0);
      });
    });
  });
}
