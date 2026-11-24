import { describe, expect, it } from 'vitest';

import { buildCsp, securityHeaders } from './csp';

describe('buildCsp', () => {
  it('returns the base directives', () => {
    const csp = buildCsp({ isDev: false });

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("img-src 'self' data: blob:");
    expect(csp).toContain("font-src 'self'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain('upgrade-insecure-requests');
  });

  it('builds a nonce policy for dynamic routes (nonce + strict-dynamic)', () => {
    const csp = buildCsp({ nonce: 'abc123', isDev: false });

    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).toContain("style-src 'self' 'nonce-abc123'");
    expect(csp).not.toContain('unsafe-inline');
  });

  it('uses the documented unsafe-inline fallback for nonce-less (static) routes', () => {
    const csp = buildCsp({ isDev: false });

    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  });

  it('never contains unsafe-eval in production', () => {
    expect(buildCsp({ isDev: false })).not.toContain('unsafe-eval');
    expect(buildCsp({ nonce: 'n', isDev: false })).not.toContain('unsafe-eval');
  });

  it('adds unsafe-eval only in development', () => {
    expect(buildCsp({ isDev: true })).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    expect(buildCsp({ nonce: 'n', isDev: true })).toContain("'unsafe-eval'");
    expect(buildCsp({ isDev: true })).not.toContain('upgrade-insecure-requests');
  });

  it('adds report-uri (never report-to) when a report uri is configured', () => {
    const csp = buildCsp({ isDev: false, reportUri: 'https://example.com/csp' });

    expect(csp).toContain('report-uri https://example.com/csp');
    expect(csp).not.toContain('report-to');
  });

  it('omits reporting directives without a report uri', () => {
    expect(buildCsp({ isDev: false })).not.toContain('report-uri');
    expect(buildCsp({ isDev: false })).not.toContain('report-to');
  });
});

describe('securityHeaders', () => {
  it('returns the non-CSP headers', () => {
    const headers = securityHeaders({ isProd: true });

    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['Permissions-Policy']).toBe('camera=(), microphone=(), geolocation=()');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
  });

  it('sets HSTS only in production', () => {
    expect(securityHeaders({ isProd: true })['Strict-Transport-Security']).toBe(
      'max-age=63072000; includeSubDomains',
    );
    expect(securityHeaders({ isProd: false })['Strict-Transport-Security']).toBeUndefined();
  });
});
