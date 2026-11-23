import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthUser } from './auth.types';
import type { RequestWithUser } from './jwt-auth.guard';

/**
 * Injects the `AuthUser` the global `JwtAuthGuard` attached to the request.
 * Guarded routes always have one; public routes see `undefined`.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser | undefined =>
    context.switchToHttp().getRequest<RequestWithUser>().user,
);
