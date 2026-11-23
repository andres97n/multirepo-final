import { Inject, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Logger } from 'nestjs-pino';
import { APP_CONFIG } from '../../config/app-config';
import type { AuthConfig } from './auth.env';
import { AUTH_CLOCK, systemClock } from './auth.clock';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PasswordService } from './password.service';
import { RevocationCache } from './revocation.cache';
import { RolesGuard } from './roles.guard';
import { SessionsRepository } from './sessions.repository';
import { TokenService } from './token.service';
import { UsersController } from './users.controller';
// @module:db-mongo
import { mongoAuthProviders } from './mongo/mongo-auth.providers';
// @end-module:db-mongo
// @module:db-postgres
// import { postgresAuthProviders } from './postgres/postgres-auth.providers';
// @end-module:db-postgres

/**
 * Deletes sessions past their sliding or absolute expiry every
 * `SESSION_CLEANUP_INTERVAL_MINUTES`. The timer is unref'd (never holds the
 * process) and cleared on shutdown.
 */
@Injectable()
export class SessionCleanupService implements OnModuleDestroy {
  // ponytail: single in-process interval; switch to a cron/scheduler service
  // or an external job when instances multiply.
  private readonly timer: NodeJS.Timeout;

  constructor(
    @Inject(SessionsRepository) private readonly sessions: SessionsRepository,
    @Inject(Logger) private readonly logger: Pick<Logger, 'log' | 'warn'>,
    @Inject(APP_CONFIG) config: AuthConfig,
  ) {
    this.timer = setInterval(() => {
      void this.cleanup();
    }, config.SESSION_CLEANUP_INTERVAL_MINUTES * 60_000);
    // Never keep the process alive just for the cleanup sweep.
    this.timer.unref();
  }

  async cleanup(): Promise<number> {
    try {
      const deleted = await this.sessions.deleteExpired(new Date());
      if (deleted > 0) {
        this.logger.log({ deleted }, 'auth: expired sessions deleted');
      }
      return deleted;
    } catch (error) {
      // A DB blip must not kill the interval; the next sweep retries.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn({ reason: message }, 'auth: session cleanup failed; retrying next tick');
      return 0;
    }
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }
}

/**
 * The optional `auth` module (modules.json: `auth`). Its only touchpoints in
 * shared files are `@module:auth` marker regions (`app.module.ts`,
 * `env.schema.ts`, `.env.example`, compose) plus the core
 * `common/public.decorator.ts` the guard reads.
 */
@Module({
  controllers: [AuthController, UsersController],
  providers: [
    { provide: JwtService, useValue: new JwtService() },
    { provide: AUTH_CLOCK, useValue: systemClock },
    PasswordService,
    TokenService,
    RevocationCache,
    AuthService,
    SessionCleanupService,
    // @module:db-mongo
    ...mongoAuthProviders,
    // @end-module:db-mongo
    // @module:db-postgres
    // ...postgresAuthProviders,
    // @end-module:db-postgres
    JwtAuthGuard,
    RolesGuard,
    // Guard order: authentication first, then role checks.
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
    { provide: APP_GUARD, useExisting: RolesGuard },
  ],
  exports: [AuthService, PasswordService, TokenService, RevocationCache, AUTH_CLOCK],
})
export class AuthModule {}
