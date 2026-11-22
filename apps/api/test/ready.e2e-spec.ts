import type { NestExpressApplication } from '@nestjs/platform-express';
import { Health } from '@repo/contracts';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { DATABASE_HEALTH } from '../src/infra/database/core';
import { buildApp, withEnv } from './helpers';

/**
 * The adapter connects in the background, so readiness settles to 200 shortly
 * after boot (the live-check script retries the same way).
 */
async function untilReady(app: NestExpressApplication): Promise<{ status: number; body: unknown }> {
  let result = { status: 0, body: undefined as unknown };
  await vi.waitFor(
    async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/health/ready');
      result = { status: res.status, body: res.body };
      expect(result.status).toBe(200);
    },
    { timeout: 10000, interval: 100 },
  );
  return result;
}

describe('GET /api/v1/health/ready (AC-M04.5)', () => {
  it('returns 200 with checks.database.status=ok against the e2e database', async () => {
    const app = await buildApp();
    try {
      const res = await untilReady(app);
      const health = Health.parse(res.body);
      expect(health.status).toBe('ok');
      expect(health.checks.database?.status).toBe('ok');
    } finally {
      await app.close();
    }
  });

  it('returns 503 with status=down when the database check fails', async () => {
    const app = await buildApp([], (builder) =>
      builder.overrideProvider(DATABASE_HEALTH).useValue({
        check: () => Promise.resolve({ status: 'down' as const, message: 'unavailable' }),
      }),
    );
    try {
      const res = await request(app.getHttpServer()).get('/api/v1/health/ready');
      expect(res.status).toBe(503);
      const health = Health.parse(res.body);
      expect(health.status).toBe('down');
      expect(health.checks.database?.status).toBe('down');
      expect(health.checks.database?.message).toBe('unavailable');
    } finally {
      await app.close();
    }
  });

  it('keeps /health/live at 200 while /health/ready is 503', async () => {
    const app = await buildApp([], (builder) =>
      builder.overrideProvider(DATABASE_HEALTH).useValue({
        check: () => Promise.resolve({ status: 'down' as const }),
      }),
    );
    try {
      const live = await request(app.getHttpServer()).get('/api/v1/health/live');
      expect(live.status).toBe(200);
      const ready = await request(app.getHttpServer()).get('/api/v1/health/ready');
      expect(ready.status).toBe(503);
    } finally {
      await app.close();
    }
  });

  it('is never rate limited (readiness probes)', async () => {
    await withEnv({ THROTTLE_LIMIT: '2', THROTTLE_TTL_MS: '60000' }, async () => {
      const app = await buildApp();
      try {
        await untilReady(app);
        for (let i = 0; i < 5; i++) {
          const res = await request(app.getHttpServer()).get('/api/v1/health/ready');
          expect(res.status).toBe(200);
        }
      } finally {
        await app.close();
      }
    });
  });
});
