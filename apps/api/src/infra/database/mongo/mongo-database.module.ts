import {
  DynamicModule,
  Global,
  Inject,
  Injectable,
  Module,
  type OnModuleDestroy,
} from '@nestjs/common';
import mongoose, { type Connection } from 'mongoose';
import { Logger } from 'nestjs-pino';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { DATABASE_CONNECTION_NAME, DATABASE_HEALTH } from '../core/tokens';
import { MongoHealthIndicator } from './mongo-health.indicator';
import { DEFAULT_MONGO_URI, MONGO_CONNECTION, MONGO_RUNTIME } from './mongo.constants';
import type { MongoConfig } from './mongo.env';
import type { MongoRuntime } from './mongo.types';

// sanitizeFilter is global: every query filter is scrubbed of user-supplied
// `$`-keys unless the translator marked the clause `mongoose.trusted()`.
mongoose.set('sanitizeFilter', true);

// ponytail: fixed-interval retry; add backoff/jitter if many instances start together.

/** Strips connection strings so logs can never leak a URI. */
function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/mongodb(\+srv)?:\/\/\S+/gi, '[uri]');
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    // Never keep the process alive just for a pending retry.
    timer.unref();
  });
}

function createRuntime(connection: Connection): MongoRuntime {
  let closed = false;
  return {
    connection,
    isClosed: () => closed,
    markClosed: () => {
      closed = true;
    },
  };
}

/**
 * Creates the connection without awaiting it, then runs a background connect
 * loop: `openUri` with the configured timeouts; on failure it logs a warning
 * (no URI) and retries after `MONGO_TIMEOUT_MS` until connected or destroyed.
 * The app boots and `/health/live` works even when Mongo is down (AC-M04.5).
 */
function startConnection(
  config: MongoConfig & Pick<AppConfig, 'NODE_ENV'>,
  logger: Pick<Logger, 'warn'>,
): MongoRuntime {
  const connection = mongoose.createConnection();
  const runtime = createRuntime(connection);
  const timeoutMs = config.MONGO_TIMEOUT_MS;
  const uri = config.MONGO_URI ?? DEFAULT_MONGO_URI;
  const autoIndex = config.NODE_ENV !== 'production';
  void (async () => {
    while (!runtime.isClosed()) {
      try {
        await connection.openUri(uri, {
          serverSelectionTimeoutMS: timeoutMs,
          connectTimeoutMS: timeoutMs,
          autoIndex,
        });
        if (runtime.isClosed()) {
          await connection.close();
        }
        return;
      } catch (error) {
        if (runtime.isClosed()) {
          return;
        }
        logger.warn({ reason: describeError(error) }, 'MongoDB unavailable; retrying');
        await sleep(timeoutMs);
      }
    }
  })();
  return runtime;
}

@Injectable()
class MongoConnectionLifecycle implements OnModuleDestroy {
  constructor(@Inject(MONGO_RUNTIME) private readonly runtime: MongoRuntime) {}

  async onModuleDestroy(): Promise<void> {
    this.runtime.markClosed();
    await this.runtime.connection.close();
  }
}

@Global()
@Module({})
export class MongoDatabaseModule {
  static forRoot(): DynamicModule {
    return {
      module: MongoDatabaseModule,
      providers: [
        {
          provide: MONGO_RUNTIME,
          inject: [APP_CONFIG, Logger],
          useFactory: (
            config: MongoConfig & Pick<AppConfig, 'NODE_ENV'>,
            logger: Pick<Logger, 'warn'>,
          ): MongoRuntime => startConnection(config, logger),
        },
        {
          provide: MONGO_CONNECTION,
          inject: [MONGO_RUNTIME],
          useFactory: (runtime: MongoRuntime): Connection => runtime.connection,
        },
        { provide: DATABASE_CONNECTION_NAME, useValue: DATABASE_CONNECTION_NAME },
        { provide: DATABASE_HEALTH, useClass: MongoHealthIndicator },
        MongoConnectionLifecycle,
      ],
      exports: [MONGO_CONNECTION, DATABASE_HEALTH, DATABASE_CONNECTION_NAME],
    };
  }
}
