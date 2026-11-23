import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { composeEnvSchema, coreEnvFragment } from '../../config/env.schema';
import { authEnvFragment } from './auth.env';

// The spec composes the schema itself instead of importing `envSchema`, so it
// keeps passing when other module marker regions are pruned.
const schema = composeEnvSchema(coreEnvFragment, authEnvFragment);
const PRODUCTION = {
  NODE_ENV: 'production',
  CORS_ORIGIN: 'https://app.example.org',
  JWT_ACCESS_SECRET: 'Zq8vK2mXr9LpT4wYc7NbH3sFj6DgA1eU',
};

describe('auth env fragment', () => {
  it('applies the documented defaults', () => {
    const config = authEnvFragment.parse({});
    expect(config.JWT_ACCESS_SECRET).toBeUndefined();
    expect(config.JWT_ISSUER).toBe('multirepo-api');
    expect(config.JWT_AUDIENCE).toBe('multirepo-web');
    expect(config.JWT_ACCESS_TTL_SECONDS).toBe(900);
    expect(config.REFRESH_IDLE_TTL_DAYS).toBe(7);
    expect(config.REFRESH_FAMILY_TTL_DAYS).toBe(30);
    expect(config.REFRESH_GRACE_SECONDS).toBe(10);
    expect(config.ARGON2_MEMORY_COST).toBe(19456);
    expect(config.ARGON2_TIME_COST).toBe(2);
    expect(config.ARGON2_PARALLELISM).toBe(1);
    expect(config.LOCKOUT_THRESHOLD).toBe(5);
    expect(config.LOCKOUT_BASE_SECONDS).toBe(60);
    expect(config.LOCKOUT_MAX_SECONDS).toBe(900);
    expect(config.AUTH_REVOCATION_CACHE_TTL_SECONDS).toBe(15);
    expect(config.LOGIN_THROTTLE_LIMIT).toBe(10);
    expect(config.LOGIN_THROTTLE_TTL_MS).toBe(60000);
    expect(config.SESSION_CLEANUP_INTERVAL_MINUTES).toBe(60);
    expect(config.SEED_ADMIN_EMAIL).toBeUndefined();
    expect(config.SEED_ADMIN_PASSWORD).toBeUndefined();
  });

  it('coerces numeric strings from the environment', () => {
    const config = authEnvFragment.parse({
      JWT_ACCESS_TTL_SECONDS: '600',
      REFRESH_GRACE_SECONDS: '0',
      AUTH_REVOCATION_CACHE_TTL_SECONDS: '0',
    });
    expect(config.JWT_ACCESS_TTL_SECONDS).toBe(600);
    expect(config.REFRESH_GRACE_SECONDS).toBe(0);
    expect(config.AUTH_REVOCATION_CACHE_TTL_SECONDS).toBe(0);
  });

  it('accepts a full development env without the secret', () => {
    expect(schema.safeParse({ NODE_ENV: 'development' }).success).toBe(true);
  });

  it('rejects a missing JWT_ACCESS_SECRET in production', () => {
    const result = schema.safeParse({
      NODE_ENV: 'production',
      CORS_ORIGIN: PRODUCTION.CORS_ORIGIN,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join('.'))).toContain(
        'JWT_ACCESS_SECRET',
      );
    }
  });

  it('rejects a weak JWT_ACCESS_SECRET in production', () => {
    const short = schema.safeParse({ ...PRODUCTION, JWT_ACCESS_SECRET: 'a'.repeat(31) });
    expect(short.success).toBe(false);
    const lowEntropy = schema.safeParse({ ...PRODUCTION, JWT_ACCESS_SECRET: 'a'.repeat(40) });
    expect(lowEntropy.success).toBe(false);
  });

  it('rejects an example-like JWT_ACCESS_SECRET in production', () => {
    const result = schema.safeParse({
      ...PRODUCTION,
      JWT_ACCESS_SECRET: 'example-jwt-access-secret-0123456789abcdef',
    });
    expect(result.success).toBe(false);
  });

  it('rejects the JWT_ACCESS_SECRET example shipped in .env.example in production', () => {
    // vitest runs with cwd = apps/api (where vitest.config.mts lives).
    const example = readFileSync(path.join(process.cwd(), '.env.example'), 'utf8');
    const match = /^#?\s*JWT_ACCESS_SECRET=(.+)$/m.exec(example);
    expect(match, '.env.example documents JWT_ACCESS_SECRET').not.toBeNull();
    const value = String(match?.[1]).trim();
    // Clearly an example and long enough to reach the production checks.
    expect(value.length).toBeGreaterThanOrEqual(32);
    expect(schema.safeParse({ ...PRODUCTION, JWT_ACCESS_SECRET: value }).success).toBe(false);
  });

  it('caps REFRESH_GRACE_SECONDS at 10', () => {
    expect(authEnvFragment.safeParse({ REFRESH_GRACE_SECONDS: 11 }).success).toBe(false);
    expect(authEnvFragment.safeParse({ REFRESH_GRACE_SECONDS: 10 }).success).toBe(true);
    expect(authEnvFragment.safeParse({ REFRESH_GRACE_SECONDS: -1 }).success).toBe(false);
  });

  it('allows 0 but caps AUTH_REVOCATION_CACHE_TTL_SECONDS at 30', () => {
    expect(authEnvFragment.safeParse({ AUTH_REVOCATION_CACHE_TTL_SECONDS: 0 }).success).toBe(true);
    expect(authEnvFragment.safeParse({ AUTH_REVOCATION_CACHE_TTL_SECONDS: 31 }).success).toBe(
      false,
    );
  });

  it('requires a strong-enough secret even outside production', () => {
    expect(authEnvFragment.safeParse({ JWT_ACCESS_SECRET: 'too-short' }).success).toBe(false);
  });
});
