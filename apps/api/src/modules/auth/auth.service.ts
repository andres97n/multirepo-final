import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID, createHash } from 'node:crypto';
import type { LoginInput, MeResponse, TokenPair } from '@repo/contracts/auth';
import { Logger } from 'nestjs-pino';
import { APP_CONFIG } from '../../config/app-config';
import { NotFoundError } from '../../infra/database/core/errors';
import type { AuthConfig } from './auth.env';
import { AUTH_CLOCK, type AuthClock, systemClock } from './auth.clock';
import type { RequestMeta, Session, User } from './auth.types';
import { PasswordService } from './password.service';
import { RevocationCache } from './revocation.cache';
import { SessionsRepository } from './sessions.repository';
import { TokenService } from './token.service';
import { UsersRepository } from './users.repository';

const DAY_MS = 86_400_000;
const INVALID_CREDENTIALS = 'Invalid credentials';
const seconds = (n: number): number => n * 1000;
const days = (n: number): number => n * DAY_MS;

/**
 * Login, refresh-token rotation with reuse detection, logout and `me`.
 *
 * Every authentication failure — unknown email, wrong password, disabled
 * user, locked account, revoked/expired/unknown session — raises the same
 * `UnauthorizedException` with the same message (AC-M06.10), so callers can
 * never tell the cases apart.
 */
@Injectable()
export class AuthService {
  constructor(
    @Inject(UsersRepository) private readonly users: UsersRepository,
    @Inject(SessionsRepository) private readonly sessions: SessionsRepository,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly revocationCache: RevocationCache,
    @Inject(APP_CONFIG) private readonly config: AuthConfig,
    @Inject(Logger) private readonly logger: Pick<Logger, 'log' | 'warn'>,
    @Inject(AUTH_CLOCK) private readonly clock: AuthClock = systemClock,
  ) {}

  async login(input: LoginInput, meta: RequestMeta): Promise<TokenPair> {
    const now = this.clock.now();
    const user = await this.users.findByEmail(input.email);
    if (user === null) {
      // Equal work for unknown users, so timing does not leak e-mails.
      await this.passwords.verifyDummy(input.password);
      this.logFailedLogin(input.email, null);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    if (user.status !== 'active' || this.isLocked(user, now)) {
      await this.passwords.verifyDummy(input.password);
      this.logFailedLogin(user.email, user.id);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    const passwordOk = await this.passwords.verify(user.passwordHash, input.password);
    if (!passwordOk) {
      await this.users.recordFailedLogin(
        user.id,
        {
          threshold: this.config.LOCKOUT_THRESHOLD,
          baseSeconds: this.config.LOCKOUT_BASE_SECONDS,
          maxSeconds: this.config.LOCKOUT_MAX_SECONDS,
        },
        now,
      );
      this.logFailedLogin(user.email, user.id);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const fresh = await this.users.resetFailedLogins(user.id);
    if (this.passwords.needsRehash(user.passwordHash)) {
      // Transparent upgrade: a success lets us re-encode with current params.
      await this.users.setPasswordHash(user.id, await this.passwords.hash(input.password));
    }

    const next = this.tokens.generateRefreshToken();
    const session = await this.sessions.create({
      userId: fresh.id,
      familyId: randomUUID(),
      tokenHash: next.hash,
      expiresAt: new Date(now.getTime() + days(this.config.REFRESH_IDLE_TTL_DAYS)),
      familyExpiresAt: new Date(now.getTime() + days(this.config.REFRESH_FAMILY_TTL_DAYS)),
      revokedAt: null,
      replacedBy: null,
      previousTokenHash: null,
      retiredTokenHashes: [],
      rotatedAt: null,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    this.logger.log({ userId: fresh.id }, 'auth: login succeeded');
    return this.tokenPair(fresh, session, next.token);
  }

  async refresh(refreshToken: string, meta: RequestMeta): Promise<TokenPair> {
    const now = this.clock.now();
    const hash = this.tokens.hashRefreshToken(refreshToken);
    const session = await this.sessions.findByTokenHash(hash);
    if (session === null) {
      return this.handleReplay(hash, now, meta);
    }
    if (session.revokedAt !== null) {
      // Any use of a revoked token proves the family is compromised.
      await this.sessions.revokeFamily(session.familyId, now);
      this.revocationCache.invalidate(session.id);
      this.logFailedLogin(null, session.userId);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    if (session.expiresAt.getTime() <= now.getTime()) {
      this.logFailedLogin(null, session.userId);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    if (session.familyExpiresAt.getTime() <= now.getTime()) {
      this.logFailedLogin(null, session.userId);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    const user = await this.activeUser(session.userId);

    const next = this.tokens.generateRefreshToken();
    const rotated = await this.sessions.rotate(
      session.id,
      hash,
      {
        tokenHash: next.hash,
        // Sliding expiry, capped by the family's absolute limit (AC-M06.5).
        expiresAt: new Date(
          Math.min(
            now.getTime() + days(this.config.REFRESH_IDLE_TTL_DAYS),
            session.familyExpiresAt.getTime(),
          ),
        ),
      },
      now,
    );
    if (rotated === null) {
      // Lost a concurrent rotation: replay the winner through the grace path.
      return this.handleReplay(hash, now, meta);
    }
    return this.tokenPair(user, rotated, next.token);
  }

  async logout(sid: string): Promise<void> {
    const now = this.clock.now();
    await this.sessions.revoke(sid, now);
    // Same-process logouts are rejected immediately, even with caching on.
    this.revocationCache.invalidate(sid);
  }

  /** The `MeResponse` shape strips passwordHash and lockout fields. */
  async me(userId: string): Promise<MeResponse> {
    const user = await this.users.findById(userId);
    return { id: user.id, email: user.email, roles: user.roles };
  }

  /**
   * A token nobody currently holds: either the replay of a rotated token
   * (reuse detection revokes the whole family, AC-M06.3) or a replay inside
   * the bounded grace window of a concurrent rotation, which gets a fresh
   * valid pair without revoking anything.
   */
  private async handleReplay(hash: string, now: Date, meta: RequestMeta): Promise<TokenPair> {
    const previous = await this.sessions.findByRetiredTokenHash(hash);
    if (previous === null) {
      // Unknown token entirely: no session context to log, keep it generic.
      this.logger.warn({ reason: 'unknown-refresh-token' }, 'auth: refresh failed');
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    const rotatedAt = previous.rotatedAt;
    // Only the immediately previous token may use the grace window; anything
    // older is plain reuse. A zero window disables the lenient path entirely.
    const inGraceWindow =
      this.config.REFRESH_GRACE_SECONDS > 0 &&
      previous.previousTokenHash === hash &&
      rotatedAt !== null &&
      now.getTime() - rotatedAt.getTime() <= seconds(this.config.REFRESH_GRACE_SECONDS);
    const head =
      inGraceWindow && previous.revokedAt === null
        ? await this.sessions.findActiveByFamily(previous.familyId)
        : null;
    // The head must also still be valid: an expired family is not resurrected
    // through the grace window.
    const headIsValid =
      head !== null &&
      head.expiresAt.getTime() > now.getTime() &&
      head.familyExpiresAt.getTime() > now.getTime();
    if (!headIsValid) {
      await this.sessions.revokeFamily(previous.familyId, now);
      // Reuse detection: the replaying client and the family are logged so
      // operators can correlate incidents; the token itself never is.
      this.logger.warn(
        { userId: previous.userId, ip: meta.ip },
        'auth: refresh token reuse detected; session family revoked',
      );
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    // Grace hit: rotate the family head for this caller; nothing is revoked.
    const user = await this.activeUser(head.userId);
    const next = this.tokens.generateRefreshToken();
    const rotated = await this.sessions.rotate(
      head.id,
      head.tokenHash,
      {
        tokenHash: next.hash,
        expiresAt: new Date(
          Math.min(
            now.getTime() + days(this.config.REFRESH_IDLE_TTL_DAYS),
            head.familyExpiresAt.getTime(),
          ),
        ),
      },
      now,
    );
    if (rotated === null) {
      // Head moved again (racing beyond the atomic step): refuse, revoke.
      await this.sessions.revokeFamily(previous.familyId, now);
      this.logFailedLogin(null, head.userId);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    return this.tokenPair(user, rotated, next.token);
  }

  private async activeUser(userId: string): Promise<User> {
    let user: User;
    try {
      user = await this.users.findById(userId);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new UnauthorizedException(INVALID_CREDENTIALS);
      }
      throw error;
    }
    if (user.status !== 'active') {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    return user;
  }

  private isLocked(user: User, now: Date): boolean {
    return user.lockedUntil !== null && user.lockedUntil.getTime() > now.getTime();
  }

  private tokenPair(user: User, session: Session, refreshToken: string): TokenPair {
    return {
      accessToken: this.tokens.signAccess({ sub: user.id, roles: user.roles, sid: session.id }),
      refreshToken,
      expiresIn: this.tokens.accessTtlSeconds,
    };
  }

  /**
   * AC-M06.15: only `userId` or a SHA-256 email hash is logged — never the
   * raw e-mail, password or token.
   */
  private logFailedLogin(email: string | null, userId: string | null): void {
    this.logger.warn(
      userId !== null ? { userId } : { emailHash: this.emailHash(email) },
      'auth: login failed',
    );
  }

  private emailHash(email: string | null): string {
    return createHash('sha256')
      .update(email ?? randomUUID(), 'utf8')
      .digest('hex');
  }
}
