import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { asErrorEnvelope, buildApp } from './helpers';

function hasHealthSchema(body: unknown): boolean {
  const schemas =
    (body as { components?: { schemas?: Record<string, unknown> } }).components?.schemas ?? {};
  return Object.keys(schemas).some((key) => key.toLowerCase().includes('health'));
}

describe('OpenAPI docs (AC-M03.7)', () => {
  it('serves the spec in development and contains the Health schema', async () => {
    process.env.NODE_ENV = 'development';
    const app = await buildApp();
    const res = await request(app.getHttpServer()).get('/api/docs-json');
    expect(res.status).toBe(200);
    expect(hasHealthSchema(res.body)).toBe(true);
    await app.close();
    delete process.env.NODE_ENV;
  });

  it('returns 404 in production by default', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN = 'https://example.com';
    const app = await buildApp();
    const res = await request(app.getHttpServer()).get('/api/docs-json');
    expect(res.status).toBe(404);
    expect(asErrorEnvelope(res.body).error.code).toBe('NOT_FOUND');
    await app.close();
    delete process.env.NODE_ENV;
    delete process.env.CORS_ORIGIN;
  });

  it('serves the spec in production when API_DOCS_ENABLED=true', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN = 'https://example.com';
    process.env.API_DOCS_ENABLED = 'true';
    const app = await buildApp();
    const res = await request(app.getHttpServer()).get('/api/docs-json');
    expect(res.status).toBe(200);
    expect(hasHealthSchema(res.body)).toBe(true);
    await app.close();
    delete process.env.NODE_ENV;
    delete process.env.CORS_ORIGIN;
    delete process.env.API_DOCS_ENABLED;
  });
});
