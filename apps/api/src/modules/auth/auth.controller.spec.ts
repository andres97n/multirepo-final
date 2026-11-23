import { UnauthorizedException } from '@nestjs/common';
import 'reflect-metadata';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { IS_PUBLIC_KEY } from '../../common/public.decorator';
import type { AuthUser } from './auth.types';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';

const META = { ip: '::1', userAgent: 'vitest' };

const request = { ip: '::1', headers: { 'user-agent': 'vitest' } } as unknown as Request;

function controllerWith(auth: Partial<AuthService>): AuthController {
  return new AuthController(auth as unknown as AuthService);
}

/** Run the `@CurrentUser()` param factory the way Nest's params consumer does. */
function currentUserValue(
  handler: 'me',
  requestValue: Record<string, unknown>,
): AuthUser | undefined {
  const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, AuthController, handler) as Record<
    string,
    { factory: (data: unknown, context: ExecutionContext) => AuthUser | undefined; data?: unknown }
  >;
  const entry = Object.values(args)[0];
  if (entry === undefined) {
    throw new Error(`@CurrentUser() metadata missing on ${handler}`);
  }
  const context = {
    switchToHttp: () => ({ getRequest: () => requestValue }),
  } as unknown as ExecutionContext;
  return entry.factory(entry.data, context);
}

describe('AuthController', () => {
  it('login delegates with the parsed body and request meta', async () => {
    const login = vi
      .fn()
      .mockResolvedValue({ accessToken: 'a', refreshToken: 'r', expiresIn: 900 });
    const controller = controllerWith({ login });
    const body = { email: 'a@b.com', password: 'pw' };
    await expect(controller.login(body, request)).resolves.toEqual({
      accessToken: 'a',
      refreshToken: 'r',
      expiresIn: 900,
    });
    expect(login).toHaveBeenCalledWith(body, META);
  });

  it('refresh passes the raw refresh token and meta', async () => {
    const refresh = vi
      .fn()
      .mockResolvedValue({ accessToken: 'a', refreshToken: 'r2', expiresIn: 900 });
    const controller = controllerWith({ refresh });
    await controller.refresh({ refreshToken: 'r1' }, request);
    expect(refresh).toHaveBeenCalledWith('r1', META);
  });

  it('logout revokes the current sid', async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    const controller = controllerWith({ logout });
    const user: AuthUser = { id: 'u1', roles: ['user'], sid: 's1' };
    await expect(controller.logout(user)).resolves.toBeUndefined();
    expect(logout).toHaveBeenCalledWith('s1');
  });

  it('logout without a user is 401 (guard misordering safety net)', async () => {
    const controller = controllerWith({ logout: vi.fn() });
    await expect(controller.logout(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('me returns the service payload', async () => {
    const me = vi.fn().mockResolvedValue({ id: 'u1', email: 'a@b.com', roles: ['user'] });
    const controller = controllerWith({ me });
    const user: AuthUser = { id: 'u1', roles: ['user'], sid: 's1' };
    await expect(controller.me(user)).resolves.toEqual({
      id: 'u1',
      email: 'a@b.com',
      roles: ['user'],
    });
    expect(me).toHaveBeenCalledWith('u1');
  });

  it('me without a user is 401', () => {
    const controller = controllerWith({ me: vi.fn() });
    expect(() => controller.me(undefined)).toThrow(UnauthorizedException);
  });

  it('the CurrentUser decorator reads req.user set by the guard', () => {
    const user: AuthUser = { id: 'u1', roles: ['user'], sid: 's1' };
    expect(currentUserValue('me', { user })).toEqual(user);
    expect(currentUserValue('me', {})).toBeUndefined();
  });

  it('login and refresh are marked public; logout and me are not', () => {
    // Read decorator metadata off the handler functions without detaching
    // them (descriptor access keeps `this` semantics out of the picture).
    const meta = (name: 'login' | 'refresh' | 'logout'): unknown => {
      const value: unknown = Object.getOwnPropertyDescriptor(AuthController.prototype, name)?.value;
      if (value === undefined) {
        return undefined;
      }
      const metadata: unknown = Reflect.getMetadata(IS_PUBLIC_KEY, value as object);
      return metadata;
    };
    expect(meta('login')).toBe(true);
    expect(meta('refresh')).toBe(true);
    expect(meta('logout')).toBeUndefined();
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, AuthController)).toBeUndefined();
  });
});
