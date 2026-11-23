import { type CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@repo/contracts/auth';
import { ROLES_KEY } from './roles.decorator';
import type { RequestWithUser } from './jwt-auth.guard';

/**
 * Global RBAC guard (second `APP_GUARD` in `AuthModule`, registered after
 * `JwtAuthGuard` so `req.user` is always set when a route has `@Roles`).
 * Routes without `@Roles` pass; roles are the JWT's live session roles.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required === undefined || required.length === 0) {
      return true;
    }
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    // Without an authenticated user a role-restricted route is simply
    // forbidden; `JwtAuthGuard` runs first, so this only covers misordering.
    if (user === undefined || !user.roles.some((role) => required.includes(role))) {
      throw new ForbiddenException();
    }
    return true;
  }
}
