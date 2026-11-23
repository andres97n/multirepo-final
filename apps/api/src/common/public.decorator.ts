import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key marking a route (or a whole controller) as public. The global
 * `JwtAuthGuard` from `@module:auth` skips exactly these routes; everything
 * else requires a valid access token. This decorator lives in `common/` (not
 * inside the auth module) so shared controllers can opt out without
 * importing from `modules/auth`.
 */
export const IS_PUBLIC_KEY = 'isPublic';

/** Opt a handler or controller out of authentication. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
