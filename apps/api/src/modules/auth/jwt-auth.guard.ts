import {
  type CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../common/public.decorator';
import { NotFoundError } from '../../infra/database/core/errors';
import { RevocationCache } from './revocation.cache';
import { SessionsRepository } from './sessions.repository';
import { TokenService } from './token.service';
import type { AuthUser } from './auth.types';

/** A request that has passed the JWT guard. */
export type RequestWithUser = Request & { user?: AuthUser };

/**
 * Global authentication guard (registered via `APP_GUARD` inside
 * `AuthModule`). `@Public()` routes skip it; everything else needs
 * `Authorization: Bearer <access token>` whose session is still valid —
 * revoked or vanished sessions are rejected, with the check cached per
 * process for `AUTH_REVOCATION_CACHE_TTL_SECONDS` (0 disables the cache).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    @Inject(SessionsRepository) private readonly sessions: SessionsRepository,
    private readonly cache: RevocationCache,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const authorization = request.headers.authorization ?? '';
    if (!authorization.startsWith('Bearer ')) {
      throw new UnauthorizedException();
    }
    const claims = this.tokens.verifyAccess(authorization.slice('Bearer '.length));
    if (claims === null) {
      throw new UnauthorizedException();
    }

    const cached = this.cache.get(claims.sid);
    if (cached === undefined) {
      const revoked = await this.isRevoked(claims.sid);
      this.cache.set(claims.sid, revoked);
      if (revoked) {
        throw new UnauthorizedException();
      }
    } else if (cached) {
      throw new UnauthorizedException();
    }

    request.user = { id: claims.sub, roles: claims.roles, sid: claims.sid };
    return true;
  }

  /** Revoked, deleted or unknown session ids are all "revoked"; nothing else fails. */
  private async isRevoked(sid: string): Promise<boolean> {
    try {
      const session = await this.sessions.findById(sid);
      return session.revokedAt !== null;
    } catch (error) {
      // Slice 1 made findById throw NotFoundError for unknown/malformed ids.
      if (error instanceof NotFoundError) {
        return true;
      }
      throw error;
    }
  }
}
