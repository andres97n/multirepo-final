import { z } from 'zod';

/**
 * Web env schema. Lives WITHOUT `server-only` on purpose: `next.config.ts`
 * imports it to fail `next build` / boot with the invalid variable NAMES
 * (AC-M08.6). `src/lib/env.ts` wraps it with `server-only` so client code can
 * never read the parsed values (AC-M08.7).
 */
export const envSchema = z.object({
  /** Base URL of the API. Required. Example: http://localhost:3001 */
  API_URL: z.url(),
  /** Timeout for server-side API fetches in ms. */
  API_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  NODE_ENV: z.enum(['development', 'test', 'production']).optional(),
  /** Optional CSP report-uri / report-to endpoint. */
  CSP_REPORT_URI: z.url().optional(),
});

export type WebEnv = z.infer<typeof envSchema>;

/**
 * Pure env parser. Returns the parsed env or throws an Error listing each
 * invalid variable NAME (never values).
 */
export function parseEnv(source: unknown): WebEnv {
  const result = envSchema.safeParse(source);
  if (result.success) {
    return result.data;
  }
  const names = [
    ...new Set(result.error.issues.map((issue) => issue.path.join('.') || '(unknown)')),
  ];
  names.sort();
  throw new Error(`Invalid environment variables: ${names.join(', ')}`);
}
