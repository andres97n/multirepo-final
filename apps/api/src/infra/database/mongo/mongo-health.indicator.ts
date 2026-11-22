import { Inject, Injectable } from '@nestjs/common';
import { ConnectionStates, type Connection } from 'mongoose';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import type { DatabaseHealth, DatabaseHealthResult } from '../core/health';
import { MONGO_CONNECTION } from './mongo.constants';

/**
 * Readiness probe for the Mongo adapter: a lightweight `ping` guarded by
 * `MONGO_TIMEOUT_MS`. Messages are fixed strings — connection URIs and driver
 * error text never reach the response.
 */
@Injectable()
export class MongoHealthIndicator implements DatabaseHealth {
  constructor(
    @Inject(MONGO_CONNECTION) private readonly connection: Connection,
    @Inject(APP_CONFIG) private readonly config: Pick<AppConfig, 'MONGO_TIMEOUT_MS'>,
  ) {}

  async check(): Promise<DatabaseHealthResult> {
    if (this.connection.readyState !== ConnectionStates.connected || !this.connection.db) {
      return { status: 'down', message: 'unavailable' };
    }
    let timer: NodeJS.Timeout | undefined;
    try {
      const admin = this.connection.db.admin();
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error('ping timeout'));
        }, this.config.MONGO_TIMEOUT_MS);
      });
      await Promise.race([admin.ping(), timeout]);
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
