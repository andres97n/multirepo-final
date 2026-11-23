import { z } from 'zod';
// @module:db-mongo
import { mongoEnvFragment } from '../infra/database/mongo/mongo.env';
// @end-module:db-mongo
// @module:db-postgres
// import { postgresEnvFragment } from '../infra/database/postgres/postgres.env';
// @end-module:db-postgres
// @module:auth
import { authEnvFragment } from '../modules/auth/auth.env';
// @end-module:auth

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

const SECRET_MIN_BYTES = 32;
const EXAMPLE_SECRET_PATTERN = /(example|changeme|change-me|placeholder)/i;
const SECRET_MIN_DISTINCT_CHARS = 8;

function looksLikeExampleSecret(value: string): boolean {
  return EXAMPLE_SECRET_PATTERN.test(value) || new Set(value).size < SECRET_MIN_DISTINCT_CHARS;
}

/**
 * Merges the given fragments and applies the production-only superRefine:
 * - `CORS_ORIGIN` must not contain `*`;
 * - every `*_SECRET` value must be >= 32 bytes and must not be an example/low-entropy value;
 * - every field tagged `.meta({ requiredInProduction: true })` must be set.
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
    for (const [key, field] of Object.entries(shape)) {
      if ((field as z.ZodType).meta()?.requiredInProduction === true && env[key] === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} is required in production`,
        });
      }
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
      } else if (looksLikeExampleSecret(value)) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} must not be an example/placeholder value in production`,
        });
      }
    }
  });
}

export const envSchema = composeEnvSchema(
  coreEnvFragment,
  // @module:db-mongo
  mongoEnvFragment,
  // @end-module:db-mongo
  // @module:db-postgres
  // postgresEnvFragment,
  // @end-module:db-postgres
  // @module:auth
  authEnvFragment,
  // @end-module:auth
);

/**
 * The core config shape plus the active module fragments. `composeEnvSchema`
 * returns a loosely-typed schema on purpose (it merges arbitrary fragments),
 * so precise types are derived here; each module widens `ModuleEnv` with its
 * own fragment inside its marker region.
 */
type ModuleEnv =
  // @module:db-mongo
  z.infer<typeof mongoEnvFragment> &
    // @end-module:db-mongo
    // @module:db-postgres
    // z.infer<typeof postgresEnvFragment> &
    // @end-module:db-postgres
    // @module:auth
    z.infer<typeof authEnvFragment> &
    // @end-module:auth
    Record<never, never>;
export type AppConfig = z.infer<typeof coreEnvFragment> & ModuleEnv;
