import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { composeEnvSchema, coreEnvFragment, envSchema } from './env.schema';

describe('env schema', () => {
  it('accepts a minimal development env with defaults', () => {
    const config = envSchema.parse({ NODE_ENV: 'development' });
    expect(config.PORT).toBe(3001);
    expect(config.CORS_ORIGIN).toEqual(['http://localhost:3000']);
    expect(config.THROTTLE_TTL_MS).toBe(60000);
    expect(config.THROTTLE_LIMIT).toBe(100);
    expect(config.LOG_LEVEL).toBe('info');
    expect(config.API_DOCS_ENABLED).toBe(false);
    expect(config.TRUST_PROXY).toBe(0);
  });

  it('parses CORS_ORIGIN as a comma-separated list', () => {
    const config = envSchema.parse({ CORS_ORIGIN: 'http://a.com, http://b.com' });
    expect(config.CORS_ORIGIN).toEqual(['http://a.com', 'http://b.com']);
  });

  it('rejects CORS_ORIGIN=* in production', () => {
    const result = envSchema.safeParse({ NODE_ENV: 'production', CORS_ORIGIN: '*' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join('.'))).toContain('CORS_ORIGIN');
    }
  });

  it('rejects a missing required variable from a fragment', () => {
    const schema = composeEnvSchema(coreEnvFragment, z.object({ REQUIRED_VAR: z.string() }));
    const result = schema.safeParse({ NODE_ENV: 'development' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join('.'))).toContain('REQUIRED_VAR');
    }
  });

  it('rejects a short secret in production (via a fragment)', () => {
    const schema = composeEnvSchema(coreEnvFragment, z.object({ MY_SECRET: z.string() }));
    const result = schema.safeParse({
      NODE_ENV: 'production',
      CORS_ORIGIN: 'https://example.com',
      MY_SECRET: 'short',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join('.'))).toContain('MY_SECRET');
    }
  });

  it('rejects an example-value secret in production', () => {
    const schema = composeEnvSchema(coreEnvFragment, z.object({ MY_SECRET: z.string() }));
    const result = schema.safeParse({
      NODE_ENV: 'production',
      CORS_ORIGIN: 'https://example.com',
      MY_SECRET: 'example-secret-value-1234567890',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a valid secret in production', () => {
    const schema = composeEnvSchema(coreEnvFragment, z.object({ MY_SECRET: z.string() }));
    const result = schema.safeParse({
      NODE_ENV: 'production',
      CORS_ORIGIN: 'https://example.com',
      MY_SECRET: 'Zq8vK2mXr9LpT4wYc7NbH3sFj6DgA1eU',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a low-entropy secret in production', () => {
    const schema = composeEnvSchema(coreEnvFragment, z.object({ MY_SECRET: z.string() }));
    const result = schema.safeParse({
      NODE_ENV: 'production',
      CORS_ORIGIN: 'https://example.com',
      MY_SECRET: 'a'.repeat(40),
    });
    expect(result.success).toBe(false);
  });

  it('rejects wildcard and null CORS origins in production', () => {
    for (const origin of ['https://*.example.com', 'null']) {
      const result = envSchema.safeParse({ NODE_ENV: 'production', CORS_ORIGIN: origin });
      expect(result.success, origin).toBe(false);
    }
  });
});
