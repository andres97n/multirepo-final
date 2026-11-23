import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { ConflictError, NotFoundError } from '../../infra/database/core/errors';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { Session } from './auth.types';
import { FakeSessionsRepository } from './testing/fake-repositories';
import { authTestConfig } from './testing/spec-config';
import { RevocationCache } from './revocation.cache';
import { TokenService } from './token.service';

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    userId: 'user-1',
    familyId: 'family-1',
    tokenHash: 'hash',
    expiresAt: new Date('2026-11-29T12:00:00.000Z'),
    familyExpiresAt: new Date('2026-12-22T12:00:00.000Z'),
    revokedAt: null,
    replacedBy: null,
    previousTokenHash: null,
    retiredTokenHashes: [],
    rotatedAt: null,
    ip: null,
    userAgent: null,
    ...overrides,
  };
}

function contextFor(request: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => function handler(): void {},
    getClass: () => TestController,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
    }),
  } as unknown as ExecutionContext;
}

class TestController {
  handler(): void {}
}

function buildGuard(options: {
  isPublic?: boolean;
  session?: Session | null;
  findError?: Error;
  cacheTtl?: number;
}): {
  guard: JwtAuthGuard;
  tokens: TokenService;
  request: Record<string, unknown>;
  findById: ReturnType<typeof vi.fn>;
} {
  const sessions = new FakeSessionsRepository();
  const findById = vi.fn((): Promise<Session> => {
    if (options.findError !== undefined) {
      return Promise.reject(options.findError);
    }
    if (options.session === undefined || options.session === null) {
      return Promise.reject(new NotFoundError());
    }
    return Promise.resolve(options.session);
  });
  sessions.findById = findById;
  const cache = new RevocationCache(
    authTestConfig({ AUTH_REVOCATION_CACHE_TTL_SECONDS: options.cacheTtl ?? 0 }),
  );
  const tokens = new TokenService(authTestConfig(), new JwtService());
  const reflector = {
    getAllAndOverride: () => options.isPublic === true,
  } as unknown as Reflector;
  const guard = new JwtAuthGuard(reflector, tokens, sessions, cache);
  const bearer = `Bearer ${tokens.signAccess({ sub: 'user-1', roles: ['user'], sid: 'session-1' })}`;
  const request: Record<string, unknown> = { headers: { authorization: bearer } };
  return { guard, tokens, request, findById };
}

describe('JwtAuthGuard', () => {
  it('lets @Public() routes through without touching the token', async () => {
    const { guard } = buildGuard({ isPublic: true });
    const request: Record<string, unknown> = { headers: {} };
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('rejects missing and malformed Authorization headers', async () => {
    for (const headers of [{}, { authorization: 'Token abc' }, { authorization: 'Basic abc' }]) {
      const { guard } = buildGuard({ session: session() });
      await expect(guard.canActivate(contextFor({ headers }))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    }
  });

  it('rejects tokens that fail verification', async () => {
    const { guard, tokens } = buildGuard({ session: session() });
    vi.spyOn(tokens, 'verifyAccess').mockReturnValue(null);
    await expect(
      guard.canActivate(contextFor({ headers: { authorization: 'Bearer forged' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('attaches req.user from the verified claims for an active session', async () => {
    const { guard, request } = buildGuard({ session: session() });
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toEqual({ id: 'user-1', roles: ['user'], sid: 'session-1' });
  });

  it('rejects revoked sessions', async () => {
    const { guard, request } = buildGuard({
      session: session({ revokedAt: new Date('2026-11-22T12:00:00.000Z') }),
    });
    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(request.user).toBeUndefined();
  });

  it('treats unknown (NotFoundError) session ids as revoked', async () => {
    const { guard, request } = buildGuard({ findError: new NotFoundError() });
    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('propagates non-NotFound database failures', async () => {
    const { guard, request } = buildGuard({ findError: new ConflictError('email') });
    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(ConflictError);
  });

  it('answers from the cache within the TTL (one repository read)', async () => {
    const { guard, request, findById } = buildGuard({ session: session(), cacheTtl: 15 });
    const context = contextFor(request);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(findById).toHaveBeenCalledTimes(1);
  });

  it('cached revocation rejects without a second read', async () => {
    const { guard, request, findById } = buildGuard({
      session: session({ revokedAt: new Date('2026-11-22T11:00:00.000Z') }),
      cacheTtl: 15,
    });
    const context = contextFor(request);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findById).toHaveBeenCalledTimes(1);
  });

  it('always re-reads the store when the cache is disabled (TTL 0, AC-M06.4)', async () => {
    const { guard, request, findById } = buildGuard({ session: session(), cacheTtl: 0 });
    const context = contextFor(request);
    await guard.canActivate(context);
    await guard.canActivate(context);
    expect(findById).toHaveBeenCalledTimes(2);
  });
});
