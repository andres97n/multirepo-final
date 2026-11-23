import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import type { Role } from '@repo/contracts/auth';
import { describe, expect, it } from 'vitest';
import { IS_PUBLIC_KEY, Public } from '../../common/public.decorator';
import { ROLES_KEY, Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';

function contextFor(request: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => handlerFixture,
    getClass: () => TestController,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
    }),
  } as unknown as ExecutionContext;
}

function handlerFixture(): void {}

class TestController {
  sample(): void {}
}

function guardFor(required: Role[] | undefined, request: Record<string, unknown>): boolean {
  const reflector = {
    getAllAndOverride: () => required,
  } as unknown as Reflector;
  return new RolesGuard(reflector).canActivate(contextFor(request));
}

describe('RolesGuard (@Roles)', () => {
  it('allows routes without @Roles metadata', () => {
    expect(guardFor(undefined, {})).toBe(true);
    expect(guardFor([], {})).toBe(true);
  });

  it('allows when the user holds one of the required roles', () => {
    expect(guardFor(['admin'], { user: { id: 'u1', roles: ['admin', 'user'], sid: 's1' } })).toBe(
      true,
    );
  });

  it('rejects when no role intersects', () => {
    expect(() => guardFor(['admin'], { user: { id: 'u1', roles: ['user'], sid: 's1' } })).toThrow(
      ForbiddenException,
    );
  });

  it('rejects an unauthenticated request on a role-restricted route', () => {
    expect(() => guardFor(['admin'], {})).toThrow(ForbiddenException);
  });

  it('the Roles decorator stores the metadata under the guard key', () => {
    class Target {
      @Roles('admin', 'user')
      method(): void {}
    }
    const value: unknown = Object.getOwnPropertyDescriptor(Target.prototype, 'method')?.value;
    expect(value).toBeInstanceOf(Function);
    if (typeof value === 'function') {
      const metadata: unknown = Reflect.getMetadata(ROLES_KEY, value);
      expect(metadata).toEqual(['admin', 'user']);
    }
  });

  it('the Public decorator stores its metadata on classes and handlers', () => {
    @Public()
    class Target {}
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, Target)).toBe(true);
  });
});
