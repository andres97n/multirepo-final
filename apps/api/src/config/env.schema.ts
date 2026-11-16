import { z } from 'zod';

const boolFromString = z.enum(['true', 'false']).transform((value) => value === 'true');

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

/**
 * The core (always-present) environment fragment. M04/M06 add their own
 * fragments and merge them with `composeEnvSchema`.
 */
export const coreEnvFragment = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:3000')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),
  THROTTLE_TTL_MS: z.coerce.number().int().min(0).default(60000),
  THROTTLE_LIMIT: z.coerce.number().int().min(1).default(100),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  API_DOCS_ENABLED: boolFromString.default(false),
});

export type EnvFragment = z.ZodObject<z.ZodRawShape>;

/**
 * Convenience for optional modules that contribute `*_SECRET` variables. The
 * production rules in `composeEnvSchema` validate every `*_SECRET` key by name.
 */
export function secretFragment<const T extends z.ZodRawShape>(shape: T): z.ZodObject<T> {
  return z.object(shape);
}

const SECRET_MIN_BYTES = 32;
const EXAMPLE_SECRET_PATTERN = /(example|changeme|change-me|placeholder)/i;

/**
 * Merges the given fragments and applies the production-only superRefine:
 * - `CORS_ORIGIN` must not contain `*`;
 * - every `*_SECRET` value must be >= 32 bytes and must not be an example value.
 */
export function composeEnvSchema(...fragments: EnvFragment[]) {
  const shape = fragments.reduce<z.ZodRawShape>(
    (acc, fragment) => ({ ...acc, ...fragment.shape }),
    {},
  );
  return z.object(shape).superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') {
      return;
    }
    if (
      Array.isArray(env.CORS_ORIGIN) &&
      env.CORS_ORIGIN.some((origin: string) => origin.includes('*') || origin === 'null')
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['CORS_ORIGIN'],
        message: 'CORS_ORIGIN must not contain "*" or "null" in production',
      });
    }
    for (const [key, value] of Object.entries(env)) {
      if (!key.endsWith('_SECRET') || typeof value !== 'string') {
        continue;
      }
      if (Buffer.byteLength(value, 'utf8') < SECRET_MIN_BYTES) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} must be at least ${String(SECRET_MIN_BYTES)} bytes in production`,
        });
      } else if (EXAMPLE_SECRET_PATTERN.test(value)) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} must not be an example/placeholder value in production`,
        });
      }
    }
  });
}

export const envSchema = composeEnvSchema(coreEnvFragment);

/**
 * The core config shape. `composeEnvSchema` returns a loosely-typed schema on
 * purpose (it merges arbitrary fragments), so the precise type is derived from
 * the core fragment here; M04/M06 widen it as they add fragments.
 */
export type AppConfig = z.infer<typeof coreEnvFragment>;
