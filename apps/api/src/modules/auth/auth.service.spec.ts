import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { LoginInput } from '@repo/contracts/auth';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '../../infra/database/core/errors';
import type { AuthConfig } from './auth.env';
import { AuthService } from './auth.service';
import type { User } from './auth.types';
import { PasswordService } from './password.service';
import { RevocationCache } from './revocation.cache';
import { TokenService } from './token.service';
import {
  FakeSessionsRepository,
  FakeUsersRepository,
  ManualClock,
} from './testing/fake-repositories';
import { authTestConfig } from './testing/spec-config';

const T0 = new Date('2026-11-22T12:00:00.000Z');
const DAY = 86_400_000;
const PASSWORD = 'super-secret-password';
const EMAIL = 'alice@example.com';

interface LogEntry {
  obj: Record<string, unknown>;
  msg: string;
}

async function build(options: { config?: AuthConfig } = {}) {
  const config = options.config ?? authTestConfig();
  const users = new FakeUsersRepository();
  const sessions = new FakeSessionsRepository();
  const passwords = new PasswordService(config);
  const tokens = new TokenService(config, new JwtService());
  const revocationCache = new RevocationCache({
    ...config,
    AUTH_REVOCATION_CACHE_TTL_SECONDS: 0,
  });
  const logs: LogEntry[] = [];
  const logger = {
    log: (obj: Record<string, unknown>, msg: string): void => {
      logs.push({ obj, msg });
    },
    warn: (obj: Record<string, unknown>, msg: string): void => {
      logs.push({ obj, msg });
    },
  };
  const clock = new ManualClock();
  clock.set(T0);
  const service = new AuthService(
    users,
    sessions,
    passwords,
    tokens,
    revocationCache,
    config,
    logger,
    clock,
  );
  const stored: User = {
    id: 'user-1',
    email: EMAIL,
    passwordHash: await passwords.hash(PASSWORD),
    roles: ['user'],
    status: 'active',
    failedLoginCount: 0,
    lockedUntil: null,
  };
  users.put(stored);
  return {
    service,
    users,
    sessions,
    passwords,
    tokens,
    revocationCache,
    logs,
    clock,
    stored,
    config,
  };
}

function loginInput(): LoginInput {
  return { email: EMAIL, password: PASSWORD };
}

const META = { ip: '203.0.113.7', userAgent: 'vitest' };

describe('AuthService.login (AC-M06.1, AC-M06.9, AC-M06.10, AC-M06.15)', () => {
  let ctx: Awaited<ReturnType<typeof build>>;
  beforeEach(async () => {
    ctx = await build();
  });

  it('creates a session family and returns a valid token pair', async () => {
    const pair = await ctx.service.login(loginInput(), META);
    expect(pair.expiresIn).toBe(900);
    const claims = ctx.tokens.verifyAccess(pair.accessToken);
    expect(claims).not.toBeNull();
    expect(claims?.sub).toBe('user-1');
    expect(claims?.roles).toEqual(['user']);
    const session = await ctx.sessions.findByTokenHash(
      ctx.tokens.hashRefreshToken(pair.refreshToken),
    );
    expect(session).not.toBeNull();
    expect(session?.userId).toBe('user-1');
    expect(session?.familyId).toMatch(/^[0-9a-f-]{36}$/);
    expect(session?.expiresAt.getTime()).toBe(T0.getTime() + 7 * DAY);
    expect(session?.familyExpiresAt.getTime()).toBe(T0.getTime() + 30 * DAY);
    expect(session?.ip).toBe(META.ip);
    expect(session?.userAgent).toBe(META.userAgent);
    // The access token carries the sid of exactly this session.
    expect(claims?.sid).toBe(session?.id);
  });

  it('resets the failure counter on success', async () => {
    await ctx.service
      .login({ email: EMAIL, password: 'wrong-password-here' }, META)
      .catch(() => undefined);
    expect((await ctx.users.findByEmail(EMAIL))?.failedLoginCount).toBe(1);
    await ctx.service.login(loginInput(), META);
    const user = await ctx.users.findByEmail(EMAIL);
    expect(user?.failedLoginCount).toBe(0);
    expect(user?.lockedUntil).toBeNull();
  });

  it('rehashes transparently when the stored parameters are stale', async () => {
    const weaker = new PasswordService(
      authTestConfig({ ARGON2_MEMORY_COST: 128, ARGON2_TIME_COST: 2 }),
    );
    const injected = await weaker.hash(PASSWORD);
    expect(ctx.passwords.needsRehash(injected)).toBe(true);
    ctx.users.put({ ...ctx.stored, passwordHash: injected });
    await ctx.service.login(loginInput(), META);
    const after = await ctx.users.findByEmail(EMAIL);
    expect(after?.passwordHash).not.toBe(injected);
    // Now the current parameters verify the rehashed digest: it is not stale.
    if (after !== null) {
      expect(ctx.passwords.needsRehash(after.passwordHash)).toBe(false);
    }
  });

  it('unknown email and wrong password are indistinguishable (AC-M06.10)', async () => {
    const unknown = await ctx.service
      .login({ email: 'ghost@example.com', password: PASSWORD }, META)
      .catch((error: unknown) => error);
    const wrong = await ctx.service
      .login({ email: EMAIL, password: 'wrong-password-here' }, META)
      .catch((error: unknown) => error);
    expect(unknown).toBeInstanceOf(UnauthorizedException);
    expect(wrong).toBeInstanceOf(UnauthorizedException);
    const shape = (value: unknown): { status: number; body: unknown } => {
      const exception = value as UnauthorizedException;
      return { status: exception.getStatus(), body: exception.getResponse() };
    };
    expect(shape(unknown)).toEqual(shape(wrong));
  });

  it('runs the dummy verify for unknown emails so timing is comparable', async () => {
    const spy = vi.spyOn(ctx.passwords, 'verifyDummy');
    await expect(
      ctx.service.login({ email: 'ghost@example.com', password: 'whatever123456' }, META),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('locks after the threshold and refuses correct passwords while locked (AC-M06.9)', async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      await ctx.service
        .login({ email: EMAIL, password: 'wrong-password-here' }, META)
        .catch(() => undefined);
    }
    const locked = await ctx.users.findByEmail(EMAIL);
    expect(locked?.lockedUntil?.getTime()).toBe(T0.getTime() + 60_000);
    ctx.clock.advanceMs(59_000);
    await expect(ctx.service.login(loginInput(), META)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    ctx.clock.advanceMs(2_000); // past the 60 s lock
    await expect(ctx.service.login(loginInput(), META)).resolves.toBeDefined();
  });

  it('treats disabled users exactly like wrong credentials', async () => {
    ctx.users.put({ ...ctx.stored, status: 'disabled' });
    const spy = vi.spyOn(ctx.passwords, 'verifyDummy');
    const error = (await ctx.service
      .login(loginInput(), META)
      .catch((value: unknown) => value)) as UnauthorizedException;
    expect(error.getStatus()).toBe(401);
    expect(error.getResponse()).toEqual({
      message: 'Invalid credentials',
      error: 'Unauthorized',
      statusCode: 401,
    });
    expect(spy).toHaveBeenCalled();
  });

  it('never logs raw passwords, tokens or emails (AC-M06.15)', async () => {
    await ctx.service
      .login({ email: EMAIL, password: 'wrong-password-here' }, META)
      .catch(() => undefined);
    await ctx.service
      .login({ email: 'ghost@example.com', password: 'whatever123456' }, META)
      .catch(() => undefined);
    const dumped = JSON.stringify(ctx.logs);
    expect(dumped).not.toContain(PASSWORD);
    expect(dumped).not.toContain('wrong-password-here');
    expect(dumped).not.toContain('whatever123456');
    expect(dumped).not.toContain(EMAIL);
    // ... while still identifying attempts by userId or hashed email.
    expect(dumped).toContain('userId');
    expect(dumped).toContain('emailHash');
  });
});

describe('AuthService.refresh (AC-M06.2, AC-M06.3, AC-M06.5)', () => {
  let ctx: Awaited<ReturnType<typeof build>>;
  let pair: Awaited<ReturnType<AuthService['login']>>;

  beforeEach(async () => {
    ctx = await build();
    pair = await ctx.service.login(loginInput(), META);
  });

  it('rotates the token and kills the old one (AC-M06.2)', async () => {
    const next = await ctx.service.refresh(pair.refreshToken, META);
    expect(next.refreshToken).not.toBe(pair.refreshToken);
    expect(
      await ctx.sessions.findByTokenHash(ctx.tokens.hashRefreshToken(pair.refreshToken)),
    ).toBeNull();
    const session = await ctx.sessions.findByTokenHash(
      ctx.tokens.hashRefreshToken(next.refreshToken),
    );
    expect(session).not.toBeNull();
    const claims = ctx.tokens.verifyAccess(next.accessToken);
    expect(claims?.sid).toBe(session?.id);
  });

  it('replaying a rotated token revokes the whole family; the newest token dies too (AC-M06.3)', async () => {
    const graceless = await build({ config: authTestConfig({ REFRESH_GRACE_SECONDS: 0 }) });
    const first = await graceless.service.login(loginInput(), META);
    const second = await graceless.service.refresh(first.refreshToken, META);
    // Replay of the rotated-away token: 401 + family revoked.
    await expect(graceless.service.refresh(first.refreshToken, META)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    for (const session of graceless.sessions.rows.values()) {
      expect(session.revokedAt).not.toBeNull();
    }
    // ... and the newest token no longer works either.
    await expect(graceless.service.refresh(second.refreshToken, META)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('replaying a token rotated several generations ago also revokes the family (AC-M06.3)', async () => {
    const graced = await build({ config: authTestConfig({ REFRESH_GRACE_SECONDS: 10 }) });
    const first = await graced.service.login(loginInput(), META);
    const second = await graced.service.refresh(first.refreshToken, META);
    graced.clock.advanceMs(1_000);
    const third = await graced.service.refresh(second.refreshToken, META);
    // `first` is two rotations old: not the grace-eligible previous token.
    await expect(graced.service.refresh(first.refreshToken, META)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    for (const session of graced.sessions.rows.values()) {
      expect(session.revokedAt).not.toBeNull();
    }
    await expect(graced.service.refresh(third.refreshToken, META)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('any use of a revoked session revokes its family', async () => {
    const session = await ctx.sessions.findByTokenHash(
      ctx.tokens.hashRefreshToken(pair.refreshToken),
    );
    expect(session).not.toBeNull();
    await ctx.sessions.revoke(String(session?.id), ctx.clock.now());
    await expect(ctx.service.refresh(pair.refreshToken, META)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    const after = await ctx.sessions.findByTokenHash(
      ctx.tokens.hashRefreshToken(pair.refreshToken),
    );
    expect(after?.revokedAt).not.toBeNull();
  });

  it('rejects idle-expired sessions without rotating', async () => {
    const spy = vi.spyOn(ctx.sessions, 'rotate');
    ctx.clock.advanceDays(7); // expiresAt is exactly T0+7d: reached
    await expect(ctx.service.refresh(pair.refreshToken, META)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it('extends the sliding expiry but never past the family cap (AC-M06.5)', async () => {
    const capped = await build({
      config: authTestConfig({ REFRESH_IDLE_TTL_DAYS: 10, REFRESH_FAMILY_TTL_DAYS: 12 }),
    });
    const first = await capped.service.login(loginInput(), META);
    const initial = await capped.sessions.findByTokenHash(
      capped.tokens.hashRefreshToken(first.refreshToken),
    );
    expect(initial?.familyExpiresAt.getTime()).toBe(T0.getTime() + 12 * DAY);
    expect(initial?.expiresAt.getTime()).toBe(T0.getTime() + 10 * DAY);

    capped.clock.set(new Date(T0.getTime() + 9 * DAY));
    const second = await capped.service.refresh(first.refreshToken, META);
    const afterSlide = await capped.sessions.findByTokenHash(
      capped.tokens.hashRefreshToken(second.refreshToken),
    );
    // min(now + 10d, cap) = cap (T0 + 12d): the slide was clamped.
    expect(afterSlide?.expiresAt.getTime()).toBe(T0.getTime() + 12 * DAY);

    capped.clock.set(new Date(T0.getTime() + 11 * DAY));
    const third = await capped.service.refresh(second.refreshToken, META);
    const clamped = await capped.sessions.findByTokenHash(
      capped.tokens.hashRefreshToken(third.refreshToken),
    );
    expect(clamped?.expiresAt.getTime()).toBe(T0.getTime() + 12 * DAY);

    capped.clock.set(new Date(T0.getTime() + 12 * DAY + 60_000));
    await expect(capped.service.refresh(third.refreshToken, META)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects when the user was disabled or deleted in the meantime', async () => {
    ctx.users.put({ ...ctx.stored, status: 'disabled' });
    await expect(ctx.service.refresh(pair.refreshToken, META)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    ctx.users.rows.delete('user-1');
    await expect(ctx.service.refresh(pair.refreshToken, META)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a wholly unknown token without revoking anything', async () => {
    await expect(ctx.service.refresh('never-minted-token', META)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    for (const session of ctx.sessions.rows.values()) {
      expect(session.revokedAt).toBeNull();
    }
  });

  it('serves a concurrent rotation inside the grace window without revoking', async () => {
    const graced = await build({ config: authTestConfig({ REFRESH_GRACE_SECONDS: 10 }) });
    const first = await graced.service.login(loginInput(), META);
    const second = await graced.service.refresh(first.refreshToken, META);
    // Tab B arrives with the old token right after tab A rotated it.
    graced.clock.advanceMs(5_000);
    const replayed = await graced.service.refresh(first.refreshToken, META);
    expect(replayed.refreshToken).not.toBe(second.refreshToken);
    for (const session of graced.sessions.rows.values()) {
      expect(session.revokedAt).toBeNull();
    }
    // The replayed pair is valid and the family head moved on: nothing was punished.
    graced.clock.advanceMs(1_000);
    await expect(graced.service.refresh(replayed.refreshToken, META)).resolves.toBeDefined();
  });

  it('revokes the family when the replay lands after the grace window', async () => {
    const graced = await build({ config: authTestConfig({ REFRESH_GRACE_SECONDS: 10 }) });
    const first = await graced.service.login(loginInput(), META);
    await graced.service.refresh(first.refreshToken, META);
    graced.clock.advanceMs(11_000); // outside the 10 s grace
    await expect(graced.service.refresh(first.refreshToken, META)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    for (const session of graced.sessions.rows.values()) {
      expect(session.revokedAt).not.toBeNull();
    }
  });

  it('a lost rotate race falls into the grace logic (concurrent winner)', async () => {
    const graced = await build({ config: authTestConfig({ REFRESH_GRACE_SECONDS: 10 }) });
    const issued = await graced.service.login(loginInput(), META);
    const target = [...graced.sessions.rows.values()][0];
    expect(target).toBeDefined();
    const realRotate = graced.sessions.rotate.bind(graced.sessions);
    vi.spyOn(graced.sessions, 'rotate').mockImplementationOnce(async () => {
      // A concurrent winner rotates the same session first; we then lose our
      // atomic predicate and get null.
      await realRotate(
        String(target?.id),
        String(target?.tokenHash),
        { tokenHash: 'winner-hash', expiresAt: new Date(T0.getTime() + 5_000) },
        T0,
      );
      return null;
    });
    const raced = await graced.service.refresh(issued.refreshToken, META);
    expect(raced.refreshToken).not.toBe(issued.refreshToken);
    // The winner-hash is now the previous hash: the family is intact.
    for (const session of graced.sessions.rows.values()) {
      expect(session.revokedAt).toBeNull();
    }
  });

  it('logout revokes the session and invalidates the local cache (AC-M06.4)', async () => {
    const invalidate = vi.spyOn(ctx.revocationCache, 'invalidate');
    const claims = ctx.tokens.verifyAccess(pair.accessToken);
    expect(claims).not.toBeNull();
    await ctx.service.logout(String(claims?.sid));
    const session = await ctx.sessions.findByTokenHash(
      ctx.tokens.hashRefreshToken(pair.refreshToken),
    );
    expect(session?.revokedAt?.getTime()).toBe(T0.getTime());
    expect(invalidate).toHaveBeenCalledWith(String(claims?.sid));
  });

  it('me returns exactly the contract fields', async () => {
    const me = await ctx.service.me('user-1');
    expect(me).toEqual({ id: 'user-1', email: EMAIL, roles: ['user'] });
    expect(Object.keys(me).sort()).toEqual(['email', 'id', 'roles']);
  });

  it('me propagates NotFoundError for deleted users', async () => {
    ctx.users.rows.delete('user-1');
    await expect(ctx.service.me('user-1')).rejects.toBeInstanceOf(NotFoundError);
  });
});
