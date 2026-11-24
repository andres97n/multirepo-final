import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseEnv } from './env.schema';

describe('parseEnv', () => {
  it('parses a valid env and applies defaults', () => {
    const env = parseEnv({ API_URL: 'http://localhost:3001' });

    expect(env.API_URL).toBe('http://localhost:3001');
    expect(env.API_TIMEOUT_MS).toBe(5000);
    expect(env.NODE_ENV).toBeUndefined();
    expect(env.CSP_REPORT_URI).toBeUndefined();
  });

  it('accepts optional values', () => {
    const env = parseEnv({
      API_URL: 'https://api.example.com',
      API_TIMEOUT_MS: '250',
      NODE_ENV: 'production',
      CSP_REPORT_URI: 'https://example.com/csp-report',
    });

    expect(env.API_TIMEOUT_MS).toBe(250);
    expect(env.NODE_ENV).toBe('production');
    expect(env.CSP_REPORT_URI).toBe('https://example.com/csp-report');
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
    const { env } = await import('./env');
    expect(env.API_URL).toBe('http://localhost:3001');
  });
});
