import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { Role } from '@repo/contracts/auth';
import { z } from 'zod';
import { APP_CONFIG } from '../../config/app-config';
import type { AuthConfig } from './auth.env';

/** Claims carried by an access token. `sid` ties it to one refresh session. */
export interface AccessTokenClaims {
  /** User id. */
  sub: string;
  roles: Role[];
  /** Session id; the revocation check resolves this. */
  sid: string;
}

/** Opaque refresh token and the SHA-256 hex the store keeps. */
export interface GeneratedRefreshToken {
  token: string;
  hash: string;
}

/** Exact shape an access-token payload must have (guards against junk claims). */
const ClaimsSchema = z.object({
  sub: z.string().min(1),
  roles: z.array(Role),
  sid: z.string().min(1),
});

/**
 * ponytail: fallback signing key when JWT_ACCESS_SECRET is unset outside
 * production — random per process, so tokens die on restart. Never usable in
 * production: the env schema rejects a boot without a real secret there.
 */
let processFallbackSecret: string | null = null;
function fallbackSecret(): string {
  processFallbackSecret ??= randomBytes(32).toString('base64url');
  return processFallbackSecret;
}

/**
 * Access JWTs (HS256 via `@nestjs/jwt`) and opaque refresh tokens.
 * `iss`/`aud` are set on signing and required on verification, and
 * `algorithms: ['HS256']` rejects `alg: none` and algorithm-confusion tokens
 * (AC-M06.13).
 */
@Injectable()
export class TokenService {
  private readonly secret: string;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AuthConfig,
    @Inject(JwtService) private readonly jwt: JwtService,
  ) {
    this.secret = config.JWT_ACCESS_SECRET ?? fallbackSecret();
  }

  /** Sign a short-lived HS256 access token for a session. */
  signAccess(claims: AccessTokenClaims): string {
    return this.jwt.sign(
      { ...claims },
      {
        algorithm: 'HS256',
        expiresIn: this.config.JWT_ACCESS_TTL_SECONDS,
        issuer: this.config.JWT_ISSUER,
        audience: this.config.JWT_AUDIENCE,
        secret: this.secret,
      },
    );
  }

  /**
   * Verify an access token and return its claims, or `null` for any failure:
   * bad signature, wrong `iss`/`aud`, `alg: none`, expiry or claim shape.
   */
  verifyAccess(token: string): AccessTokenClaims | null {
    try {
      const payload = this.jwt.verify<Record<string, unknown>>(token, {
        algorithms: ['HS256'],
        issuer: this.config.JWT_ISSUER,
        audience: this.config.JWT_AUDIENCE,
        secret: this.secret,
      });
      const parsed = ClaimsSchema.safeParse(payload);
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  /** Access-token lifetime in seconds (echoed as `expiresIn` in responses). */
  get accessTtlSeconds(): number {
    return this.config.JWT_ACCESS_TTL_SECONDS;
  }

  /** New 256-bit opaque refresh token plus the SHA-256 hex to store. */
  generateRefreshToken(): GeneratedRefreshToken {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: this.hashRefreshToken(token) };
  }

  /** SHA-256 hex of a refresh token; only this value ever reaches the store. */
  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }
}
