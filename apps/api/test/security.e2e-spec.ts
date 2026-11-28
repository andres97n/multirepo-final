import { Controller, Get } from '@nestjs/common';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { Public } from '../src/common/public.decorator';
import { asErrorEnvelope, buildApp, withEnv } from './helpers';

@Public()
@Controller('test-only')
class PingController {
  @Get('ping')
  ping(): { ok: true } {
    return { ok: true };
  }
}

describe('security (AC-M03.6, AC-M03.10, AC-M03.11)', () => {
  it('serves helmet headers (incl. HSTS) and no x-powered-by', async () => {
    const app = await buildApp();
    const res = await request(app.getHttpServer()).get('/api/v1/health/live');
    expect(res.headers['content-security-policy']).toContain("script-src 'self'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['strict-transport-security']).toMatch(/max-age=\d{6,}/);
    expect(res.headers['x-powered-by']).toBeUndefined();
    await app.close();
  });

  it('CORS preflight from a non-allowlisted origin gets no access-control-allow-origin', async () => {
    const app = await buildApp();
    const res = await request(app.getHttpServer())
      .options('/api/v1/health/live')
      .set('Origin', 'http://evil.example')
      .set('Access-Control-Request-Method', 'GET');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    await app.close();
  });

  it('CORS preflight from an allowlisted origin is granted without credentials', async () => {
    await withEnv({ CORS_ORIGIN: 'http://localhost:3000' }, async () => {
      const app = await buildApp();
      const res = await request(app.getHttpServer())
        .options('/api/v1/health/live')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET');
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(res.headers['access-control-allow-credentials']).toBeUndefined();
      await app.close();
    });
  });

  it('exceeding the throttle limit returns 429 RATE_LIMITED', async () => {
    await withEnv({ THROTTLE_LIMIT: '2', THROTTLE_TTL_MS: '60000' }, async () => {
      const app = await buildApp([PingController]);
      const server = app.getHttpServer();

      const first = await request(server).get('/api/v1/test-only/ping');
      const second = await request(server).get('/api/v1/test-only/ping');
      const third = await request(server).get('/api/v1/test-only/ping');

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(third.status).toBe(429);
      const envelope = asErrorEnvelope(third.body);
      expect(envelope.error.code).toBe('RATE_LIMITED');
      expect(envelope.error.requestId).toBe(third.headers['x-request-id']);

      await app.close();
    });
  });
});
