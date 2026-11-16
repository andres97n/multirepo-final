import { Health } from '@repo/contracts';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildApp } from './helpers';

const UUID_V4 = '123e4567-e89b-12d3-a456-426614174000';

describe('health and request id (AC-M03.1, AC-M03.5)', () => {
  it('GET /api/v1/health/live returns 200, a Health-valid body and x-request-id', async () => {
    const app = await buildApp();
    const res = await request(app.getHttpServer()).get('/api/v1/health/live');
    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toBeTruthy();
    expect(() => Health.parse(res.body)).not.toThrow();
    expect(res.body).toEqual({ status: 'ok', checks: {} });
    await app.close();
  });

  it('echoes a valid incoming x-request-id', async () => {
    const app = await buildApp();
    const res = await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .set('x-request-id', UUID_V4);
    expect(res.headers['x-request-id']).toBe(UUID_V4);
    await app.close();
  });

  it('replaces an invalid x-request-id (<script>) with a fresh valid id', async () => {
    const app = await buildApp();
    const res = await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .set('x-request-id', '<script>');
    expect(res.headers['x-request-id']).toBeTruthy();
    expect(res.headers['x-request-id']).not.toBe('<script>');
    await app.close();
  });
});
