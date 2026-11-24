import { EncryptJWT } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const CURRENT_SECRET = 'current-session-secret-0123456789abcdefghij';
const PREVIOUS_SECRET = 'previous-session-secret-0123456789abcdefghi';

const mocks = vi.hoisted(() => ({
  env: {
    API_URL: 'http://localhost:3001',
    API_TIMEOUT_MS: 5000,
    APP_ORIGIN: 'http://localhost:3000',
    SESSION_SECRET: 'current-session-secret-0123456789abcdefghij',
    SESSION_SECRET_PREVIOUS: undefined as string | undefined,
    SESSION_MAX_AGE_SECONDS: 3600,
    SESSION_REFRESH_SKEW_SECONDS: 60,
  },
  cookies: vi.fn(),
}));

vi.mock('./env', () => ({ env: mocks.env }));
vi.mock('next/headers', () => ({ cookies: mocks.cookies }));

import {
  buildClearSessionCookie,
  buildSessionCookie,
  decryptSession,
  encryptSession,
  readSession,
  readSessionFromRequest,
  sessionCookieName,
  sessionValueFromCookieHeader,
  setSessionCookieHeader,
  type SessionPayload,
} from './session';

const payload: SessionPayload = {
  accessToken: 'header.payload.signature',
  refreshToken: 'opaque-refresh-token-value',
  accessExp: Math.floor(Date.now() / 1000) + 1800,
};

beforeEach(() => {
  mocks.env.SESSION_SECRET = CURRENT_SECRET;
  mocks.env.SESSION_SECRET_PREVIOUS = undefined;
  mocks.env.SESSION_MAX_AGE_SECONDS = 3600;
  mocks.cookies.mockReset();
});

describe('session cookie name and attributes', () => {
  it('uses __Host-session in production and session elsewhere', () => {
    expect(sessionCookieName(true)).toBe('__Host-session');
    expect(sessionCookieName(false)).toBe('session');
  });

  it('sets HttpOnly, SameSite=Lax, Path=/ and Max-Age in development', () => {
    const cookie = buildSessionCookie('the-value', false);

    expect(cookie.startsWith('session=the-value')).toBe(true);
    expect(cookie).toContain('Max-Age=3600');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toContain('Secure');
  });

  it('adds Secure and the __Host- prefix in production (AC-M09.7)', () => {
    const cookie = buildSessionCookie('the-value', true);

    expect(cookie.startsWith('__Host-session=the-value')).toBe(true);
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Max-Age=3600');
  });

  it('clears with an empty value, Max-Age=0 and the same attributes', () => {
    for (const isProd of [false, true]) {
      const cleared = buildClearSessionCookie(isProd);
      const set = buildSessionCookie('the-value', isProd);
      const name = sessionCookieName(isProd);

      expect(cleared.startsWith(`${name}=;`)).toBe(true);
      expect(cleared).toContain('Max-Age=0');
      for (const attribute of ['Path=/', 'HttpOnly', 'SameSite=Lax']) {
        expect(cleared).toContain(attribute);
        expect(set).toContain(attribute);
      }
      expect(cleared.includes('Secure')).toBe(set.includes('Secure'));
    }
  });

  it('stays under 3.5 KB with realistic tokens', async () => {
    const big: SessionPayload = {
      accessToken: `${'a'.repeat(40)}.${'b'.repeat(800)}.${'c'.repeat(200)}`,
      refreshToken: 'r'.repeat(128),
      accessExp: Math.floor(Date.now() / 1000) + 900,
    };
    const value = await encryptSession(big);

    expect(value.length).toBeLessThan(3584);
    expect(buildSessionCookie(value).length).toBeLessThan(3584);
  });
});

describe('encryptSession / decryptSession', () => {
  it('round-trips the payload through the current secret', async () => {
    const token = await encryptSession(payload);

    expect(token).toContain('.');
    await expect(decryptSession(token)).resolves.toEqual(payload);
  });

  it('treats a tampered cookie as no session', async () => {
    const token = await encryptSession(payload);
    const parts = token.split('.');
    const last = parts[parts.length - 1] ?? '';
    // Flip the FIRST base64 char of the last segment: the final char may only
    // carry padding bits and decode to the same bytes.
    const flipped = (last[0] ?? 'A') === 'A' ? 'B' : 'A';
    const tampered = [...parts.slice(0, -1), flipped + last.slice(1)].join('.');

    expect(tampered).not.toBe(token);
    await expect(decryptSession(tampered)).resolves.toBeNull();
  });

  it('treats a truncated cookie as no session', async () => {
    const token = await encryptSession(payload);

    await expect(decryptSession(token.slice(0, Math.floor(token.length / 2)))).resolves.toBeNull();
  });

  it('treats garbage as no session', async () => {
    await expect(decryptSession('not-a-jwe-at-all')).resolves.toBeNull();
  });

  it('treats a wrong-key cookie as no session', async () => {
    const token = await encryptSession(payload);
    mocks.env.SESSION_SECRET = 'a-completely-different-secret-0123456789';

    await expect(decryptSession(token)).resolves.toBeNull();
  });

  it('still decrypts a cookie encrypted with SESSION_SECRET_PREVIOUS (AC-M09.8)', async () => {
    mocks.env.SESSION_SECRET = PREVIOUS_SECRET;
    const token = await encryptSession(payload);

    mocks.env.SESSION_SECRET = CURRENT_SECRET;
    mocks.env.SESSION_SECRET_PREVIOUS = PREVIOUS_SECRET;
    await expect(decryptSession(token)).resolves.toEqual(payload);
  });

  it('returns null without a usable secret match', async () => {
    mocks.env.SESSION_SECRET = PREVIOUS_SECRET;
    const token = await encryptSession(payload);

    mocks.env.SESSION_SECRET = CURRENT_SECRET;
    await expect(decryptSession(token)).resolves.toBeNull();
  });

  it('rejects a token whose payload fails the schema', async () => {
    const key = new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(CURRENT_SECRET)),
    );
    const token = await new EncryptJWT({ accessToken: 'missing-the-rest' })
      .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
      .setExpirationTime('5m')
      .encrypt(key);

    await expect(decryptSession(token)).resolves.toBeNull();
  });
});

describe('cookie header helpers', () => {
  it('extracts the session value from a Cookie header', () => {
    expect(sessionValueFromCookieHeader(null)).toBeNull();
    expect(sessionValueFromCookieHeader('other=1')).toBeNull();
    expect(sessionValueFromCookieHeader('session=')).toBeNull();
    expect(sessionValueFromCookieHeader('other=1; session=abc; more=2')).toBe('abc');
  });

  it('replaces the session cookie in a Cookie header, keeping the rest', () => {
    expect(setSessionCookieHeader(null, 'new')).toBe('session=new');
    expect(setSessionCookieHeader('other=1; session=old; more=2', 'new')).toBe(
      'other=1; more=2; session=new',
    );
    expect(setSessionCookieHeader('session=old', 'new')).toBe('session=new');
  });
});

describe('readSession', () => {
  function cookieStore(value: string | undefined) {
    return { get: (name: string) => (value === undefined ? undefined : { name, value }) };
  }

  it('reads the session from next/headers cookies', async () => {
    const token = await encryptSession(payload);
    mocks.cookies.mockResolvedValue(cookieStore(token));

    await expect(readSession()).resolves.toEqual(payload);
    expect(mocks.cookies).toHaveBeenCalledTimes(1);
  });

  it('returns null when there is no cookie', async () => {
    mocks.cookies.mockResolvedValue(cookieStore(undefined));

    await expect(readSession()).resolves.toBeNull();
  });

  it('returns null for an empty cookie value', async () => {
    mocks.cookies.mockResolvedValue(cookieStore(''));

    await expect(readSession()).resolves.toBeNull();
  });

  it('reads the session from a request Cookie header', async () => {
    const token = await encryptSession(payload);
    const request = new Request('http://localhost:3000/dashboard', {
      headers: { cookie: `other=1; session=${token}` },
    });

    await expect(readSessionFromRequest(request)).resolves.toEqual(payload);
  });

  it('returns null when the request has no session cookie', async () => {
    const request = new Request('http://localhost:3000/dashboard');

    await expect(readSessionFromRequest(request)).resolves.toBeNull();
  });
});
