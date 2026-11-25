import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('./lib/env', () => ({
  env: {
    API_URL: 'http://localhost:3001',
    API_TIMEOUT_MS: 5000,
    APP_ORIGIN: 'http://localhost:3000',
    SESSION_SECRET: 'proxy-test-secret-0123456789abcdefghijk',
    SESSION_MAX_AGE_SECONDS: 3600,
    SESSION_REFRESH_SKEW_SECONDS: 60,
  },
}));

import proxy, { config } from './proxy';
import { isValidRequestId } from './lib/request-id';

function run(headers: Record<string, string> = {}) {
  return proxy(new NextRequest('http://localhost:3000/', { headers }));
}

describe('proxy', () => {
  it('generates a different nonce per request', async () => {
    const first = (await run()).headers.get('content-security-policy');
    const second = (await run()).headers.get('content-security-policy');

    expect(first).toContain('nonce-');
    expect(second).toContain('nonce-');
    expect(first).not.toBe(second);
  });

  it('sets the nonce on the request headers so Next applies it to its scripts', async () => {
    const response = await run();

    const nonce = response.headers.get('x-middleware-request-x-nonce');
    expect(nonce).toBeTruthy();
    const requestCsp = response.headers.get('x-middleware-request-content-security-policy');
    expect(requestCsp).toContain(`'nonce-${nonce ?? ''}'`);
    expect(requestCsp).toContain("'strict-dynamic'");
  });

  it('sets the nonce CSP and security headers on the response', async () => {
    const response = await run();
    const csp = response.headers.get('content-security-policy');

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain('strict-dynamic');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('unsafe-eval');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(response.headers.get('permissions-policy')).toContain('camera=()');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
  });

  it('forwards a valid incoming x-request-id and echoes it on the response', async () => {
    const response = await run({ 'x-request-id': 'live-check-rid-123' });

    expect(response.headers.get('x-request-id')).toBe('live-check-rid-123');
    expect(response.headers.get('x-middleware-request-x-request-id')).toBe('live-check-rid-123');
  });

  it('replaces an invalid incoming x-request-id with a generated one', async () => {
    const response = await run({ 'x-request-id': '<script>alert(1)</script>' });

    const requestId = response.headers.get('x-request-id');
    expect(requestId).not.toBe('<script>alert(1)</script>');
    expect(isValidRequestId(requestId)).toBe(true);
  });

  it('generates an x-request-id when the incoming request has none', async () => {
    const requestId = (await run()).headers.get('x-request-id');

    expect(isValidRequestId(requestId)).toBe(true);
  });

  it('excludes static assets and prerendered pages from the matcher', () => {
    const sources = config.matcher.flatMap((entry) =>
      typeof entry === 'string' ? [entry] : [entry.source],
    );

    expect(sources).toHaveLength(1);
    const source = sources[0] ?? '';
    expect(source).toContain('_next/static');
    expect(source).toContain('_next/image');
    expect(source).toContain('favicon');
    expect(source).toContain('about');
    expect(source).not.toContain('_not-found'); // dynamic: global-not-found.tsx
  });
});
