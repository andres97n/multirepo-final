import { describe, expect, it } from 'vitest';

import { FALLBACK_PATH, sanitizeNextPath } from './safe-redirect';

describe('sanitizeNextPath', () => {
  it('keeps safe same-origin relative paths', () => {
    expect(sanitizeNextPath('/dashboard')).toBe('/dashboard');
    expect(sanitizeNextPath('/dashboard?tab=1&x=2')).toBe('/dashboard?tab=1&x=2');
    expect(sanitizeNextPath('/settings/profile')).toBe('/settings/profile');
    expect(sanitizeNextPath('/')).toBe('/');
  });

  it('falls back for missing or empty values', () => {
    expect(sanitizeNextPath(undefined)).toBe(FALLBACK_PATH);
    expect(sanitizeNextPath(null)).toBe(FALLBACK_PATH);
    expect(sanitizeNextPath('')).toBe(FALLBACK_PATH);
  });

  it('falls back for protocol-relative and backslash variants (AC-M09.10)', () => {
    expect(sanitizeNextPath('//evil.com')).toBe(FALLBACK_PATH);
    expect(sanitizeNextPath('///evil.com')).toBe(FALLBACK_PATH);
    expect(sanitizeNextPath('/\\evil.com')).toBe(FALLBACK_PATH);
    expect(sanitizeNextPath('/\\\\evil.com')).toBe(FALLBACK_PATH);
    expect(sanitizeNextPath('\\/evil.com')).toBe(FALLBACK_PATH);
    // Unparseable authority.
    expect(sanitizeNextPath('//[')).toBe(FALLBACK_PATH);
    // Resolves same-origin but is not a single-slash relative path.
    expect(sanitizeNextPath('//next.invalid/x')).toBe(FALLBACK_PATH);
  });

  it('falls back for absolute URLs (AC-M09.10)', () => {
    expect(sanitizeNextPath('https://evil.com')).toBe(FALLBACK_PATH);
    expect(sanitizeNextPath('http://evil.com/dashboard')).toBe(FALLBACK_PATH);
    expect(sanitizeNextPath('HTTPS://evil.com')).toBe(FALLBACK_PATH);
  });

  it('falls back for javascript: and other schemes', () => {
    expect(sanitizeNextPath('javascript:alert(1)')).toBe(FALLBACK_PATH);
    expect(sanitizeNextPath('data:text/html,<script>')).toBe(FALLBACK_PATH);
    expect(sanitizeNextPath('vbscript:x')).toBe(FALLBACK_PATH);
  });

  it('falls back for paths with backslashes or control characters', () => {
    expect(sanitizeNextPath('/dash\\board')).toBe(FALLBACK_PATH);
    expect(sanitizeNextPath('/dash\u0000board')).toBe(FALLBACK_PATH);
    expect(sanitizeNextPath('/dash\nboard')).toBe(FALLBACK_PATH);
    expect(sanitizeNextPath('/dash\rboard')).toBe(FALLBACK_PATH);
    expect(sanitizeNextPath('/dash\tboard')).toBe(FALLBACK_PATH);
    expect(sanitizeNextPath('/dash\u007Fboard')).toBe(FALLBACK_PATH);
  });

  it('falls back for values that do not start with a slash', () => {
    expect(sanitizeNextPath('dashboard')).toBe(FALLBACK_PATH);
    expect(sanitizeNextPath(' /dashboard')).toBe(FALLBACK_PATH);
    expect(sanitizeNextPath('/%2f%2fevil.com')).toBe('/%2f%2fevil.com');
  });
});
