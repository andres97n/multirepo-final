import { z } from 'zod';

// @module:auth
/** Session key material: at least 32 BYTES. */
const sessionSecret = z.string().refine((value) => new TextEncoder().encode(value).length >= 32, {
  message: 'must be at least 32 bytes',
});
// @end-module:auth

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
  // @module:auth
  /** Public origin of this web app (scheme + host [+ port]). Used for CSRF origin checks and `serverActions.allowedOrigins`. */
  APP_ORIGIN: z.url({ protocol: /^https?$/ }),
  /** Session-cookie encryption secret (jose dir/A256GCM key material). */
  SESSION_SECRET: sessionSecret,
  /** Previous secret accepted for decryption while rotating keys. */
  SESSION_SECRET_PREVIOUS: sessionSecret.optional(),
  /** Session-cookie lifetime in seconds (refresh-token idle TTL). */
  SESSION_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(604800),
  /** Refresh the access token when it expires within this many seconds. */
  SESSION_REFRESH_SKEW_SECONDS: z.coerce.number().int().nonnegative().default(60),
  // @end-module:auth
});

export type WebEnv = z.infer<typeof envSchema>;

/**
 * Pure env parser. Returns the parsed env or throws an Error listing each
 * invalid variable NAME (never values).
 */
export function parseEnv(source: unknown): WebEnv {
  const result = envSchema.safeParse(source);
  if (result.success) {
    // @module:auth
    // Example-looking secrets are rejected in production (values are never
    // echoed; only the variable NAMES appear in the error).
    const secrets: Array<[string, string | undefined]> = [
      ['SESSION_SECRET', result.data.SESSION_SECRET],
      ['SESSION_SECRET_PREVIOUS', result.data.SESSION_SECRET_PREVIOUS],
    ];
    const weakSecrets = secrets
      .filter(([, value]) => value !== undefined && value.toLowerCase().includes('example'))
      .map(([name]) => name);
    if (result.data.NODE_ENV === 'production' && weakSecrets.length > 0) {
      throw new Error(`Invalid environment variables: ${weakSecrets.join(', ')}`);
    }
    // @end-module:auth
    return result.data;
  }
  const names = [
    ...new Set(result.error.issues.map((issue) => issue.path.join('.') || '(unknown)')),
  ];
  names.sort();
  throw new Error(`Invalid environment variables: ${names.join(', ')}`);
}
