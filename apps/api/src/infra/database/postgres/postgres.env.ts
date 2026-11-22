import { z } from 'zod';
import {
  DATABASE_URL_PATTERN,
  DEFAULT_POSTGRES_IDLE_TIMEOUT_MS,
  DEFAULT_POSTGRES_POOL_MAX,
  DEFAULT_POSTGRES_TIMEOUT_MS,
} from './postgres.constants';

export const postgresEnvFragment = z.object({
  // No default: `requiredInProduction` makes composeEnvSchema reject a missing
  // value in production; elsewhere the module falls back to DEFAULT_DATABASE_URL.
  DATABASE_URL: z
    .string()
    .regex(DATABASE_URL_PATTERN)
    .optional()
    .meta({ requiredInProduction: true }),
  POSTGRES_POOL_MAX: z.coerce.number().int().min(1).max(200).default(DEFAULT_POSTGRES_POOL_MAX),
  // Connect timeout and readiness-probe timeout.
  POSTGRES_TIMEOUT_MS: z.coerce.number().int().min(100).default(DEFAULT_POSTGRES_TIMEOUT_MS),
  POSTGRES_IDLE_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(0)
    .default(DEFAULT_POSTGRES_IDLE_TIMEOUT_MS),
});

/**
 * The slice of `AppConfig` this adapter reads. Declared here (not taken from
 * `AppConfig`) because the fragment is only part of `AppConfig` while the
 * `@module:db-postgres` markers are active.
 */
export type PostgresConfig = z.infer<typeof postgresEnvFragment>;
