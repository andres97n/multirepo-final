import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { asErrorEnvelope, buildApp } from './helpers';

describe('security (AC-M03.6, AC-M03.10, AC-M03.11)', () => {
  it('serves helmet headers and no x-powered-by', async () => {
    const app = await buildApp();
    const res = await request(app.getHttpServer()).get('/api/v1/health/live');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
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

  it('exceeding the throttle limit returns 429 RATE_LIMITED', async () => {
    process.env.THROTTLE_LIMIT = '2';
    process.env.THROTTLE_TTL_MS = '60000';
    const app = await buildApp();
    const server = app.getHttpServer();

    const first = await request(server).get('/api/v1/health/live');
    const second = await request(server).get('/api/v1/health/live');
    const third = await request(server).get('/api/v1/health/live');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
    const envelope = asErrorEnvelope(third.body);
    expect(envelope.error.code).toBe('RATE_LIMITED');
    expect(envelope.error.requestId).toBeTruthy();

    await app.close();
    delete process.env.THROTTLE_LIMIT;
    delete process.env.THROTTLE_TTL_MS;
  });
});
