/**
 * The single place for E2E environment: ports, URLs and the env both servers
 * run with. Test lockout/throttle values are set so the UI behaves as in
 * production while the tests stay fast (see the M10 plan, Decisions).
 */

export const WEB_PORT = 3916;
export const API_PORT = 3917;
export const MONGO_PORT = 27099;

// Must be `localhost`: Chromium accepts the `__Host-` Secure cookie over http
// only on localhost.
export const WEB_URL = `http://localhost:${String(WEB_PORT)}`;
export const API_URL = `http://localhost:${String(API_PORT)}`;

/** Environment for the built api (`apps/api/scripts/e2e-server.mjs`). */
export const apiEnv: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: String(API_PORT),
  E2E_MONGO_PORT: String(MONGO_PORT),
  MONGO_URI: `mongodb://127.0.0.1:${String(MONGO_PORT)}/e2e`,
  CORS_ORIGIN: WEB_URL,
  JWT_ACCESS_SECRET: 'e2e-jwt-access-secret-0123456789abcdefghij',
  LOCKOUT_THRESHOLD: '2',
  // High throttles: a 429 shows the same UI text and would fake the lockout test.
  LOGIN_THROTTLE_LIMIT: '1000',
  THROTTLE_LIMIT: '10000',
  LOG_LEVEL: 'warn',
};

/** Environment for the built web app (`next start`). */
export const webEnv: Record<string, string> = {
  NODE_ENV: 'production',
  PORT: String(WEB_PORT),
  API_URL: API_URL,
  APP_ORIGIN: WEB_URL,
  SESSION_SECRET: 'e2e-session-secret-0123456789abcdefghijklmn',
};
