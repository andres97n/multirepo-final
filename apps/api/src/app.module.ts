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
    ThrottlerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        throttlers: [{ ttl: config.THROTTLE_TTL_MS, limit: config.THROTTLE_LIMIT }],
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
