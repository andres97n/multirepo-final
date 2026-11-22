import { Test } from '@nestjs/testing';
import mongoose, { Connection } from 'mongoose';
import { Logger } from 'nestjs-pino';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigModule } from '../../../config/config.module';
import { LoggerModule } from '../../logger/logger.module';
import { MongoDatabaseModule } from './mongo-database.module';
import { MONGO_CONNECTION } from './mongo.constants';
import { startMemoryMongo } from './testing/mongo-memory';

/**
 * Compiles the adapter exactly as the app wires it, with env-driven config
 * (ConfigModule) and a captured logger. `env` is stubbed for the test.
 */
function compileModule(env: Record<string, string>, warn = vi.fn()) {
  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value);
  }
  const builder = Test.createTestingModule({
    imports: [ConfigModule, LoggerModule, MongoDatabaseModule.forRoot()],
  })
    .overrideProvider(Logger)
    .useValue({ warn });
  return { builder, warn };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('MongoDatabaseModule', () => {
  it('enables sanitizeFilter globally', () => {
    // The module sets this at import time.
    expect(mongoose.get('sanitizeFilter')).toBe(true);
  });

  it('boots without a reachable Mongo and stops retrying after shutdown (AC-M04.5)', async () => {
    const { builder, warn } = compileModule({
      MONGO_URI: 'mongodb://127.0.0.1:9/down',
      MONGO_TIMEOUT_MS: '200',
    });
    // compile() must not throw even though Mongo is down.
    const moduleRef = await builder.compile();
    try {
      const connection = moduleRef.get<Connection>(MONGO_CONNECTION);
      expect(connection.readyState).not.toBe(1);

      // The background loop logs a warning (without the URI) and keeps retrying.
      await vi.waitFor(
        () => {
          expect(warn.mock.calls.length).toBeGreaterThan(0);
        },
        { timeout: 5000, interval: 50 },
      );
      const serialized = JSON.stringify(warn.mock.calls[0]);
      expect(serialized).not.toContain('mongodb://');

      await moduleRef.close();
      // After shutdown the retry loop is stopped: no further warnings.
      const callsAtClose = warn.mock.calls.length;
      await new Promise((resolve) => setTimeout(resolve, 700));
      expect(warn.mock.calls.length).toBe(callsAtClose);
    } finally {
      await moduleRef.close().catch(() => undefined);
    }
  });

  it('connects when Mongo becomes available', async () => {
    const { uri, stop } = await startMemoryMongo();
    const { builder } = compileModule({ MONGO_URI: uri, MONGO_TIMEOUT_MS: '2000' });
    const moduleRef = await builder.compile();
    try {
      const connection = moduleRef.get<Connection>(MONGO_CONNECTION);
      await vi.waitFor(
        () => {
          expect(connection.readyState).toBe(1);
        },
        { timeout: 10000, interval: 50 },
      );
    } finally {
      await moduleRef.close();
      await stop();
    }
  });

  it('disables autoIndex in production', async () => {
    const openUri = vi.spyOn(Connection.prototype, 'openUri');
    const { builder } = compileModule({
      NODE_ENV: 'production',
      MONGO_URI: 'mongodb://127.0.0.1:9/prod',
      MONGO_TIMEOUT_MS: '200',
    });
    const moduleRef = await builder.compile();
    try {
      expect(openUri).toHaveBeenCalledWith(
        'mongodb://127.0.0.1:9/prod',
        expect.objectContaining({ autoIndex: false }),
      );
    } finally {
      openUri.mockRestore();
      await moduleRef.close();
    }
  });

  it('enables autoIndex outside production', async () => {
    const openUri = vi.spyOn(Connection.prototype, 'openUri');
    const { builder } = compileModule({
      NODE_ENV: 'development',
      MONGO_URI: 'mongodb://127.0.0.1:9/dev',
      MONGO_TIMEOUT_MS: '200',
    });
    const moduleRef = await builder.compile();
    try {
      expect(openUri).toHaveBeenCalledWith(
        'mongodb://127.0.0.1:9/dev',
        expect.objectContaining({ autoIndex: true }),
      );
    } finally {
      openUri.mockRestore();
      await moduleRef.close();
    }
  });
});
