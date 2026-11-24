import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: {
    API_URL: 'http://api.test',
    API_TIMEOUT_MS: 5000,
    APP_ORIGIN: 'http://localhost:3000',
    SESSION_SECRET: 'proxy-test-secret-0123456789abcdefghijk',
    SESSION_SECRET_PREVIOUS: undefined as string | undefined,
    SESSION_MAX_AGE_SECONDS: 3600,
    SESSION_REFRESH_SKEW_SECONDS: 60,
  },
  apiPost: vi.fn(),
}));

vi.mock('./lib/env', () => ({ env: mocks.env }));
vi.mock('./lib/api-client.server', () => ({ apiPost: mocks.apiPost }));

import { authProxy } from './lib/auth-proxy';
import {
  buildSessionCookie,
  decryptSession,
  encryptSession,
  sessionValueFromCookieHeader,
} from './lib/session';
import proxy from './proxy';

const REFRESHED = {
  accessToken: 'new-access-token',
  refreshToken: 'new-refresh-token',
  expiresIn: 900,
};

async function sessionCookie(accessExp: number): Promise<string> {
  const value = await encryptSession({
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    accessExp,
  });
  return `session=${value}`;
}

function nextRequest(path: string, cookie?: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: cookie === undefined ? {} : { cookie },
  });
}

async function runAuth(path: string, cookie?: string) {
  const request = nextRequest(path, cookie);
  const requestHeaders = new Headers(request.headers);
  const setCookies: string[] = [];
  const response = await authProxy(request, requestHeaders, setCookies);
  return { response, requestHeaders, setCookies };
}

beforeEach(() => {
  mocks.apiPost.mockReset();
  mocks.apiPost.mockResolvedValue(REFRESHED);
});

describe('authProxy', () => {
  it('lets unprotected paths through untouched', async () => {
    const { response, setCookies } = await runAuth('/');

    expect(response).toBeNull();
    expect(setCookies).toEqual([]);
    expect(mocks.apiPost).not.toHaveBeenCalled();
  });

  it('redirects to /login?next=<path+search> without a session (AC-M09.2)', async () => {
    const { response, setCookies } = await runAuth('/dashboard?tab=1');

    expect(response?.status).toBe(307);
    expect(response?.headers.get('location')).toContain('/login?next=%2Fdashboard%3Ftab%3D1');
    expect(response?.headers.get('set-cookie')).toBeNull();
    expect(setCookies).toEqual([]);
    expect(mocks.apiPost).not.toHaveBeenCalled();
  });

  it('clears a bad cookie and redirects (AC-M09.8)', async () => {
    const { response } = await runAuth('/dashboard', 'session=garbage');

    expect(response?.status).toBe(307);
    expect(response?.headers.get('location')).toContain('/login?next=%2Fdashboard');
    const cleared = response?.headers.get('set-cookie') ?? '';
    expect(cleared).toContain('session=;');
    expect(cleared).toContain('Max-Age=0');
  });

  it('keeps a fresh session without refreshing', async () => {
    const cookie = await sessionCookie(Math.floor(Date.now() / 1000) + 300);
    const { response, setCookies } = await runAuth('/dashboard', cookie);

    expect(response).toBeNull();
    expect(setCookies).toEqual([]);
    expect(mocks.apiPost).not.toHaveBeenCalled();
  });

  it('refreshes in place and rewrites the cookie on request and response (AC-M09.3)', async () => {
    const cookie = await sessionCookie(Math.floor(Date.now() / 1000) + 30);
    const { response, requestHeaders, setCookies } = await runAuth('/dashboard', cookie);

    expect(response).toBeNull();
    expect(mocks.apiPost).toHaveBeenCalledTimes(1);
    const calls = mocks.apiPost.mock.calls as Array<
      [string, unknown, unknown, { requestId: string }]
    >;
    expect(calls[0]?.[0]).toBe('/api/v1/auth/refresh');
    expect(calls[0]?.[1]).toEqual({ refreshToken: 'refresh-token' });
    expect(calls[0]?.[3].requestId).toMatch(/^[A-Za-z0-9._-]{1,64}$/);

    // The same render sees the new cookie on the request headers.
    const requestValue = sessionValueFromCookieHeader(requestHeaders.get('cookie'));
    expect(requestValue).toBeTruthy();
    const stored = await decryptSession(requestValue ?? '');
    expect(stored?.accessToken).toBe('new-access-token');
    expect(stored?.refreshToken).toBe('new-refresh-token');
    expect(typeof stored?.accessExp).toBe('number');

    // And the browser gets it as a real Set-Cookie with the same attributes.
    expect(setCookies).toHaveLength(1);
    expect(setCookies[0]).toBe(buildSessionCookie(requestValue ?? ''));
    expect(setCookies[0]).toContain('Max-Age=3600');
    expect(setCookies[0]).toContain('HttpOnly');
    const responseValue = sessionValueFromCookieHeader(setCookies[0]?.split(';')[0] ?? null);
    await expect(decryptSession(responseValue ?? '')).resolves.toMatchObject({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    });
  });

  it('clears the cookie and redirects when the refresh fails (AC-M09.4)', async () => {
    mocks.apiPost.mockRejectedValue(new Error('refresh failed'));
    const cookie = await sessionCookie(Math.floor(Date.now() / 1000) + 30);
    const { response, setCookies } = await runAuth('/dashboard', cookie);

    expect(response?.status).toBe(307);
    expect(response?.headers.get('location')).toContain('/login?next=%2Fdashboard');
    expect(response?.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(setCookies).toEqual([]);
  });

  it('refreshes an already-expired access token', async () => {
    const cookie = await sessionCookie(Math.floor(Date.now() / 1000) - 5);
    const { response } = await runAuth('/dashboard', cookie);

    expect(response).toBeNull();
    expect(mocks.apiPost).toHaveBeenCalledTimes(1);
  });
});

describe('proxy wiring', () => {
  it('redirects protected paths through the proxy without a session', async () => {
    const response = await proxy(nextRequest('/dashboard'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/login?next=%2Fdashboard');
    expect(response.headers.get('x-request-id')).toBeTruthy();
  });

  it('appends the refreshed Set-Cookie to the continued response', async () => {
    const cookie = await sessionCookie(Math.floor(Date.now() / 1000) + 30);
    const response = await proxy(nextRequest('/dashboard', cookie));

    expect(response.status).toBe(200);
    const requestCookie = response.headers.get('x-middleware-request-cookie') ?? '';
    expect(requestCookie).toContain('session=');
    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('Max-Age=3600');
    const value = sessionValueFromCookieHeader(setCookie.split(';')[0] ?? null);
    await expect(decryptSession(value ?? '')).resolves.toMatchObject({
      accessToken: 'new-access-token',
    });
  });

  it('keeps the nonce CSP and request id behaviour', async () => {
    const response = await proxy(nextRequest('/'));

    expect(response.headers.get('content-security-policy')).toContain('nonce-');
    expect(response.headers.get('x-request-id')).toBeTruthy();
  });
});
