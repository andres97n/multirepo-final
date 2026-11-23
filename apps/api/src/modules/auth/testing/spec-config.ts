import type { AuthConfig } from '../auth.env';

/**
 * Full `AuthConfig` for unit specs: the `auth.env.ts` defaults, with Argon2
 * dialed down (m=64 KiB, t=1, p=1) so hashing stays millisecond-fast without
 * weakening the shape of the digests ($argon2id$ + m,t,p).
 */
export function authTestConfig(overrides: Partial<AuthConfig> = {}): AuthConfig {
  return {
    JWT_ACCESS_SECRET: 'unit-test-jwt-secret-0123456789-abcdefghij',
    JWT_ISSUER: 'multirepo-api',
    JWT_AUDIENCE: 'multirepo-web',
    JWT_ACCESS_TTL_SECONDS: 900,
    REFRESH_IDLE_TTL_DAYS: 7,
    REFRESH_FAMILY_TTL_DAYS: 30,
    REFRESH_GRACE_SECONDS: 10,
    ARGON2_MEMORY_COST: 64,
    ARGON2_TIME_COST: 1,
    ARGON2_PARALLELISM: 1,
    LOCKOUT_THRESHOLD: 5,
    LOCKOUT_BASE_SECONDS: 60,
    LOCKOUT_MAX_SECONDS: 900,
    AUTH_REVOCATION_CACHE_TTL_SECONDS: 15,
    LOGIN_THROTTLE_LIMIT: 10,
    LOGIN_THROTTLE_TTL_MS: 60000,
    SESSION_CLEANUP_INTERVAL_MINUTES: 60,
    SEED_ADMIN_EMAIL: undefined,
    SEED_ADMIN_PASSWORD: undefined,
    ...overrides,
  };
}
