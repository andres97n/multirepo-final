import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { APP_CONFIG, type AppConfig } from './config/app-config';
import { ConfigModule } from './config/config.module';
// @module:db-mongo
import { MongoDatabaseModule } from './infra/database/mongo';
// @end-module:db-mongo
// @module:db-postgres
// import { PostgresDatabaseModule } from './infra/database/postgres';
// @end-module:db-postgres
// @module:auth
import type { ExecutionContext } from '@nestjs/common';
import { AuthController } from './modules/auth/auth.controller';
import { AuthModule } from './modules/auth/auth.module';
// @end-module:auth
import { HealthModule } from './infra/health/health.module';
import { LoggerModule } from './infra/logger/logger.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    // @module:db-mongo
    MongoDatabaseModule.forRoot(),
    // @end-module:db-mongo
    // @module:db-postgres
    // PostgresDatabaseModule.forRoot(),
    // @end-module:db-postgres
    HealthModule,
    // @module:auth
    AuthModule,
    // @end-module:auth
    ThrottlerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        throttlers: [
          { ttl: config.THROTTLE_TTL_MS, limit: config.THROTTLE_LIMIT },
          // @module:auth
          {
            name: 'login',
            ttl: config.LOGIN_THROTTLE_TTL_MS,
            limit: config.LOGIN_THROTTLE_LIMIT,
            // The stricter `login` throttler must guard only the login route
            // (v6 applies every registered throttler to all routes, so scope
            // it here instead of skipping it on every other controller). The
            // login handler opts out of the default throttler itself.
            skipIf: (context: ExecutionContext) =>
              context.getHandler() !== AuthController.prototype.login,
          },
          // @end-module:auth
        ],
      }),
    }),
  ],
  providers: [
    { provide: APP_PIPE, useValue: new ZodValidationPipe() },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
