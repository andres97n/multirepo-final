import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { asErrorEnvelope, buildApp, withEnv } from './helpers';

function hasHealthSchema(body: unknown): boolean {
  const schemas =
    (body as { components?: { schemas?: Record<string, unknown> } }).components?.schemas ?? {};
  return Object.keys(schemas).some((key) => key.toLowerCase().includes('health'));
}

const production = {
  NODE_ENV: 'production',
  CORS_ORIGIN: 'https://example.com',
  // The wired auth fragment requires a strong JWT secret in production.
  JWT_ACCESS_SECRET: 'Zq8vK2mXr9LpT4wYc7NbH3sFj6DgA1eU',
};

describe('OpenAPI docs (AC-M03.7)', () => {
  it('serves the spec in development and contains the Health schema', async () => {
    await withEnv({ NODE_ENV: 'development' }, async () => {
      const app = await buildApp();
      const res = await request(app.getHttpServer()).get('/api/docs-json');
      expect(res.status).toBe(200);
      expect(hasHealthSchema(res.body)).toBe(true);
      await app.close();
    });
  });

  it('returns 404 for the UI and the spec in production by default', async () => {
    await withEnv({ ...production, API_DOCS_ENABLED: undefined }, async () => {
      const app = await buildApp();
      for (const path of ['/api/docs', '/api/docs-json']) {
        const res = await request(app.getHttpServer()).get(path);
        expect(res.status).toBe(404);
        expect(asErrorEnvelope(res.body).error.code).toBe('NOT_FOUND');
      }
      await app.close();
    });
  });

  it('serves the UI and the spec in production when API_DOCS_ENABLED=true', async () => {
    await withEnv({ ...production, API_DOCS_ENABLED: 'true' }, async () => {
      const app = await buildApp();
      const ui = await request(app.getHttpServer()).get('/api/docs');
      expect(ui.status).toBe(200);
      const res = await request(app.getHttpServer()).get('/api/docs-json');
      expect(res.status).toBe(200);
      expect(hasHealthSchema(res.body)).toBe(true);
      await app.close();
    });
  });
});
