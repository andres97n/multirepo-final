import { describe, expect, it } from 'vitest';
import { PostgresHealthIndicator } from './postgres-health.indicator';

const config = { POSTGRES_TIMEOUT_MS: 50 };

describe('PostgresHealthIndicator (AC-M05.4)', () => {
  it('is ok when select 1 succeeds', async () => {
    const indicator = new PostgresHealthIndicator(
      { query: () => Promise.resolve({}) } as never,
      config,
    );
    await expect(indicator.check()).resolves.toEqual({ status: 'ok' });
  });

  it('is down, without driver text, when the query fails', async () => {
    const indicator = new PostgresHealthIndicator(
      {
        query: () => Promise.reject(new Error('password authentication failed for user "app"')),
      } as never,
      config,
    );
    await expect(indicator.check()).resolves.toEqual({ status: 'down', message: 'unavailable' });
  });

  it('is down when the query exceeds the timeout', async () => {
    const indicator = new PostgresHealthIndicator(
      { query: () => new Promise(() => undefined) } as never,
      config,
    );
    await expect(indicator.check()).resolves.toEqual({ status: 'down', message: 'unavailable' });
  });
});
