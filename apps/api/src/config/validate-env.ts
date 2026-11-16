import { envSchema } from './env.schema';
import type { AppConfig } from './env.schema';

/**
 * Validates `process.env` against the env schema and throws a single error
 * listing every invalid variable by name. The boot entrypoint (main.ts) prints
 * that message and exits non-zero.
 */
export function validateEnv(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(env);
  if (result.success) {
    return result.data as AppConfig;
  }
  const details = result.error.issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.join('.') : '(root)'}: ${issue.message}`)
    .join('\n  - ');
  throw new Error(`Invalid environment variables:\n  - ${details}`);
}
