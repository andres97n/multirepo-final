import { SetMetadata } from '@nestjs/common';
import type { Role } from '@repo/contracts/auth';

/** Metadata key holding the roles a route requires (read by `RolesGuard`). */
export const ROLES_KEY = 'auth:roles';

/**
 * Require one of the given roles for the handler/controller. Only meaningful
 * behind `JwtAuthGuard`; without `@Roles` the `RolesGuard` lets the request
 * through.
 */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
