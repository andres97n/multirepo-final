import { describe, expect, it, vi } from 'vitest';
import { composeEnvSchema, coreEnvFragment } from '../../../config/env.schema';
import { DATABASE_CONNECTION_NAME, DATABASE_HEALTH } from '../core/tokens';
import {
  createPool,
  PostgresDatabaseModule,
  PostgresPoolLifecycle,
} from './postgres-database.module';
import { postgresEnvFragment } from './postgres.env';

describe('PostgresDatabaseModule', () => {
  it('builds a lazy pool from the env config and shuts it down gracefully', async () => {
    const config = postgresEnvFragment.parse({ POSTGRES_POOL_MAX: '3' });
    const pool = createPool(config, { warn: vi.fn() });
    expect(pool.options.max).toBe(3);
    expect(pool.options.connectionTimeoutMillis).toBe(3000);
    const end = vi.spyOn(pool, 'end');
    await new PostgresPoolLifecycle(pool).onModuleDestroy();
    expect(end).toHaveBeenCalledOnce();
  });

  it('logs idle client errors instead of crashing', () => {
    const warn = vi.fn();
    const pool = createPool(postgresEnvFragment.parse({}), { warn });
    pool.emit('error', new Error('boom'));
    expect(warn).toHaveBeenCalledOnce();
    void pool.end();
  });

  it('exports the health port and connection name', () => {
    const module = PostgresDatabaseModule.forRoot();
    expect(module.exports).toEqual(
      expect.arrayContaining([DATABASE_HEALTH, DATABASE_CONNECTION_NAME]),
    );
  });

  it('requires DATABASE_URL in production and validates its scheme', () => {
    const schema = composeEnvSchema(coreEnvFragment, postgresEnvFragment);
    expect(schema.safeParse({ NODE_ENV: 'production', CORS_ORIGIN: 'https://a.io' }).success).toBe(
      false,
    );
    expect(schema.safeParse({ DATABASE_URL: 'mysql://x' }).success).toBe(false);
    expect(
      schema.safeParse({ DATABASE_URL: 'postgres://app:app@localhost:5432/app' }).success,
    ).toBe(true);
  });
});
