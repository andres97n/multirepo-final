import {
  DynamicModule,
  Global,
  Inject,
  Injectable,
  Module,
  type OnModuleDestroy,
} from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Logger } from 'nestjs-pino';
import { Pool } from 'pg';
import { APP_CONFIG } from '../../../config/app-config';
import { DATABASE_CONNECTION_NAME, DATABASE_HEALTH } from '../core/tokens';
import { PostgresHealthIndicator } from './postgres-health.indicator';
import { DEFAULT_DATABASE_URL, POSTGRES_DB, POSTGRES_POOL } from './postgres.constants';
import type { PostgresConfig } from './postgres.env';
import type { PostgresDb } from './postgres.types';

// ponytail: pg Pool connects lazily, so the app boots with Postgres down and
// recovers by itself; add a startup connectivity probe if fail-fast is wanted.

export function createPool(config: PostgresConfig, logger: Pick<Logger, 'warn'>): Pool {
  const pool = new Pool({
    connectionString: config.DATABASE_URL ?? DEFAULT_DATABASE_URL,
    max: config.POSTGRES_POOL_MAX,
    idleTimeoutMillis: config.POSTGRES_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: config.POSTGRES_TIMEOUT_MS,
  });
  // Idle-client errors would otherwise crash the process (unhandled 'error').
  pool.on('error', () => {
    logger.warn('PostgreSQL idle client error');
  });
  return pool;
}

@Injectable()
export class PostgresPoolLifecycle implements OnModuleDestroy {
  constructor(@Inject(POSTGRES_POOL) private readonly pool: Pool) {}

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

@Global()
@Module({})
export class PostgresDatabaseModule {
  static forRoot(): DynamicModule {
    return {
      module: PostgresDatabaseModule,
      providers: [
        {
          provide: POSTGRES_POOL,
          inject: [APP_CONFIG, Logger],
          useFactory: (config: PostgresConfig, logger: Pick<Logger, 'warn'>): Pool =>
            createPool(config, logger),
        },
        {
          provide: POSTGRES_DB,
          inject: [POSTGRES_POOL],
          useFactory: (pool: Pool): PostgresDb => drizzle(pool),
        },
        { provide: DATABASE_CONNECTION_NAME, useValue: DATABASE_CONNECTION_NAME },
        { provide: DATABASE_HEALTH, useClass: PostgresHealthIndicator },
        PostgresPoolLifecycle,
      ],
      exports: [POSTGRES_DB, POSTGRES_POOL, DATABASE_HEALTH, DATABASE_CONNECTION_NAME],
    };
  }
}
