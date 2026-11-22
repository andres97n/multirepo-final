import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { APP_CONFIG } from '../../../config/app-config';
import type { DatabaseHealth, DatabaseHealthResult } from '../core/health';
import { POSTGRES_POOL } from './postgres.constants';
import type { PostgresConfig } from './postgres.env';

/**
 * Readiness probe for the Postgres adapter: `select 1` guarded by
 * `POSTGRES_TIMEOUT_MS`. Messages are fixed strings — connection strings and
 * driver error text never reach the response.
 */
@Injectable()
export class PostgresHealthIndicator implements DatabaseHealth {
  constructor(
    @Inject(POSTGRES_POOL) private readonly pool: Pick<Pool, 'query'>,
    @Inject(APP_CONFIG) private readonly config: Pick<PostgresConfig, 'POSTGRES_TIMEOUT_MS'>,
  ) {}

  async check(): Promise<DatabaseHealthResult> {
    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error('select 1 timeout'));
        }, this.config.POSTGRES_TIMEOUT_MS);
      });
      await Promise.race([this.pool.query('select 1'), timeout]);
      return { status: 'ok' };
    } catch {
      return { status: 'down', message: 'unavailable' };
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }
}
