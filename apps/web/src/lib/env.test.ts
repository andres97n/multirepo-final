// @module:auth
import { readFileSync } from 'node:fs';
// @end-module:auth
import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseEnv } from './env.schema';

// @module:auth
const AUTH_SECRET = 'test-session-secret-0123456789abcdefghijklmno';
// @end-module:auth

describe('parseEnv', () => {
  it('parses a valid env and applies defaults', () => {
    const env = parseEnv({
      API_URL: 'http://localhost:3001',
      // @module:auth
      APP_ORIGIN: 'http://localhost:3000',
      SESSION_SECRET: AUTH_SECRET,
      // @end-module:auth
    });

    expect(env.API_URL).toBe('http://localhost:3001');
    expect(env.API_TIMEOUT_MS).toBe(5000);
    expect(env.NODE_ENV).toBeUndefined();
    expect(env.CSP_REPORT_URI).toBeUndefined();
    // @module:auth
    expect(env.APP_ORIGIN).toBe('http://localhost:3000');
    expect(env.SESSION_SECRET).toBe(AUTH_SECRET);
    expect(env.SESSION_SECRET_PREVIOUS).toBeUndefined();
    expect(env.SESSION_MAX_AGE_SECONDS).toBe(604800);
    expect(env.SESSION_REFRESH_SKEW_SECONDS).toBe(60);
    // @end-module:auth
  });

  it('accepts optional values', () => {
    const env = parseEnv({
      API_URL: 'https://api.example.com',
      API_TIMEOUT_MS: '250',
      NODE_ENV: 'production',
      CSP_REPORT_URI: 'https://example.com/csp-report',
      // @module:auth
      APP_ORIGIN: 'http://localhost:3000',
      SESSION_SECRET: AUTH_SECRET,
      // @end-module:auth
    });

    expect(env.API_TIMEOUT_MS).toBe(250);
    expect(env.NODE_ENV).toBe('production');
    expect(env.CSP_REPORT_URI).toBe('https://example.com/csp-report');
    // @module:auth
    expect(env.SESSION_MAX_AGE_SECONDS).toBe(604800);
    // @end-module:auth
  });

  it('throws listing the NAME of a missing required variable', () => {
    expect(() => parseEnv({})).toThrow(/API_URL/);
  });

  it('throws listing the NAME of an invalid value, never the value', () => {
    let message = '';
    try {
      parseEnv({ API_URL: 'not-a-url' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('API_URL');
    expect(message).not.toContain('not-a-url');
    // @module:auth
    expect(message).not.toContain(AUTH_SECRET);
    // @end-module:auth
  });

  it('throws listing each invalid variable name', () => {
    let message = '';
    try {
      parseEnv({
        API_URL: 'nope',
        API_TIMEOUT_MS: 'soon',
        CSP_REPORT_URI: 'also-not-a-url',
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('API_URL');
    expect(message).toContain('API_TIMEOUT_MS');
    expect(message).toContain('CSP_REPORT_URI');
    expect(message).not.toContain('nope');
  });

  it('rejects a non-integer timeout', () => {
    expect(() => parseEnv({ API_URL: 'http://localhost:3001', API_TIMEOUT_MS: '1.5' })).toThrow(
      /API_TIMEOUT_MS/,
    );
  });
});

describe('env (server-only module)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('throws listing the variable name when the real process env is invalid', async () => {
    vi.stubEnv('API_URL', 'definitely-not-a-url');
    await expect(import('./env')).rejects.toThrow(/API_URL/);
  });

  it('parses the real process env once at import', async () => {
    vi.stubEnv('API_URL', 'http://localhost:3001');
    // @module:auth
    vi.stubEnv('APP_ORIGIN', 'http://localhost:3000');
    vi.stubEnv('SESSION_SECRET', AUTH_SECRET);
    // @end-module:auth
    const { env } = await import('./env');
    expect(env.API_URL).toBe('http://localhost:3001');
  });
});

// @module:auth
describe('parseEnv (auth)', () => {
  function authEnv(overrides: Record<string, string> = {}): Record<string, string> {
    return {
      API_URL: 'http://localhost:3001',
      APP_ORIGIN: 'http://localhost:3000',
      SESSION_SECRET: AUTH_SECRET,
      ...overrides,
    };
  }

  it('parses auth values and applies the session defaults', () => {
    const env = parseEnv(authEnv());

    expect(env.APP_ORIGIN).toBe('http://localhost:3000');
    expect(env.SESSION_SECRET).toBe(AUTH_SECRET);
    expect(env.SESSION_SECRET_PREVIOUS).toBeUndefined();
    expect(env.SESSION_MAX_AGE_SECONDS).toBe(604800);
    expect(env.SESSION_REFRESH_SKEW_SECONDS).toBe(60);
  });

  it('accepts optional auth values', () => {
    const env = parseEnv(
      authEnv({
        SESSION_SECRET_PREVIOUS: `${AUTH_SECRET}-previous`,
        SESSION_MAX_AGE_SECONDS: '3600',
        SESSION_REFRESH_SKEW_SECONDS: '30',
      }),
    );

    expect(env.SESSION_SECRET_PREVIOUS).toBe(`${AUTH_SECRET}-previous`);
    expect(env.SESSION_MAX_AGE_SECONDS).toBe(3600);
    expect(env.SESSION_REFRESH_SKEW_SECONDS).toBe(30);
  });

  it('throws listing the NAME of every missing required variable', () => {
    let message = '';
    try {
      parseEnv({});
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('API_URL');
    expect(message).toContain('APP_ORIGIN');
    expect(message).toContain('SESSION_SECRET');
    expect(message).not.toContain(AUTH_SECRET);
  });

  it('rejects secrets shorter than 32 bytes, naming the variables only', () => {
    let message = '';
    try {
      parseEnv(authEnv({ SESSION_SECRET: 'too-short' }));
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('SESSION_SECRET');
    expect(message).not.toContain('too-short');
    expect(() => parseEnv(authEnv({ SESSION_SECRET_PREVIOUS: 'also-short' }))).toThrow(
      /SESSION_SECRET_PREVIOUS/,
    );
  });

  it('counts the secret size in bytes', () => {
    const secret = 'é'.repeat(16);

    expect(parseEnv(authEnv({ SESSION_SECRET: secret })).SESSION_SECRET).toBe(secret);
  });

  it('rejects example-looking secrets in production, naming the variables only', () => {
    let message = '';
    try {
      parseEnv(
        authEnv({
          NODE_ENV: 'production',
          SESSION_SECRET: 'example-secret-but-long-enough-to-pass-length',
          SESSION_SECRET_PREVIOUS: 'previous-example-secret-long-enough-here',
        }),
      );
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('SESSION_SECRET');
    expect(message).toContain('SESSION_SECRET_PREVIOUS');
    expect(message).not.toContain('example-secret');
  });

  it('rejects the .env.example placeholder secrets in production', () => {
    const example = readFileSync(new URL('../../.env.example', import.meta.url), 'utf8');
    for (const name of ['SESSION_SECRET', 'SESSION_SECRET_PREVIOUS']) {
      const value = new RegExp(`^(?:# )?${name}=(.+)$`, 'm').exec(example)?.[1]?.trim() ?? '';

      expect(() => parseEnv(authEnv({ NODE_ENV: 'production', [name]: value }))).toThrow(name);
    }
  });

  it('rejects an APP_ORIGIN that is not http(s)', () => {
    expect(() => parseEnv(authEnv({ APP_ORIGIN: 'localhost:3000' }))).toThrow(/APP_ORIGIN/);
  });

  it('gives Server Actions the APP_ORIGIN host, which is what Next compares', async () => {
    vi.stubEnv('API_URL', 'http://localhost:3001');
    vi.stubEnv('APP_ORIGIN', 'https://app.test:8443');
    vi.stubEnv('SESSION_SECRET', AUTH_SECRET);
    const { default: config } = await import('../../next.config');
    vi.unstubAllEnvs();

    expect(config.experimental?.serverActions?.allowedOrigins).toEqual(['app.test:8443']);
  });

  it('accepts example-looking secrets outside production', () => {
    const env = parseEnv(
      authEnv({ SESSION_SECRET: 'example-secret-but-long-enough-to-pass-length' }),
    );

    expect(env.SESSION_SECRET).toContain('example');
  });
});
// @end-module:auth
