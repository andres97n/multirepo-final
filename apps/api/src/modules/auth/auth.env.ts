import { z } from 'zod';

/**
 * Environment fragment for the optional `auth` module. It is merged into
 * `envSchema` only inside the `@module:auth` regions, so pruning the module
 * removes every variable below together with its defaults.
 */
export const authEnvFragment = z.object({
  // No dev default: a default would make `requiredInProduction` untestable
  // (composeEnvSchema only flags undefined values), so the secret stays
  // optional outside production and required inside it, like `MONGO_URI`.
  JWT_ACCESS_SECRET: z.string().min(32).optional().meta({ requiredInProduction: true }),
  JWT_ISSUER: z.string().min(1).default('multirepo-api'),
  JWT_AUDIENCE: z.string().min(1).default('multirepo-web'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(1).default(900),
  REFRESH_IDLE_TTL_DAYS: z.coerce.number().int().min(1).default(7),
  REFRESH_FAMILY_TTL_DAYS: z.coerce.number().int().min(1).default(30),
  // Hard-capped at 10 s: wider windows widen the replay-grace attack surface.
  REFRESH_GRACE_SECONDS: z.coerce.number().int().min(0).max(10).default(10),
  ARGON2_MEMORY_COST: z.coerce.number().int().min(1).default(19456),
  ARGON2_TIME_COST: z.coerce.number().int().min(1).default(2),
  ARGON2_PARALLELISM: z.coerce.number().int().min(1).default(1),
  LOCKOUT_THRESHOLD: z.coerce.number().int().min(1).default(5),
  LOCKOUT_BASE_SECONDS: z.coerce.number().int().min(1).default(60),
  LOCKOUT_MAX_SECONDS: z.coerce.number().int().min(1).default(900),
  // 0 disables the cache (every request hits the session store); 30 s is the
  // worst-case revocation delay, so anything larger is rejected.
  AUTH_REVOCATION_CACHE_TTL_SECONDS: z.coerce.number().int().min(0).max(30).default(15),
  LOGIN_THROTTLE_LIMIT: z.coerce.number().int().min(1).default(10),
  LOGIN_THROTTLE_TTL_MS: z.coerce.number().int().min(1000).default(60000),
  SESSION_CLEANUP_INTERVAL_MINUTES: z.coerce.number().int().min(1).default(60),
  SEED_ADMIN_EMAIL: z.email().optional(),
  SEED_ADMIN_PASSWORD: z.string().min(1).optional(),
});

/**
 * The slice of `AppConfig` the auth module reads, declared here because the
 * fragment is only part of `AppConfig` while `@module:auth` is active.
 */
export type AuthConfig = z.infer<typeof authEnvFragment>;
