import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readdirSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';

import { ErrorEnvelope } from '@repo/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import * as healthRoute from '../health/route';
import * as loginRoute from './login/route';
import * as logoutRoute from './logout/route';

const mocks = vi.hoisted(() => ({
  env: {
    API_URL: '',
    API_TIMEOUT_MS: 3000,
    APP_ORIGIN: 'http://web.test',
    SESSION_SECRET: 'handlers-test-secret-0123456789abcdefgh',
    SESSION_SECRET_PREVIOUS: undefined as string | undefined,
    SESSION_MAX_AGE_SECONDS: 3600,
    SESSION_REFRESH_SKEW_SECONDS: 60,
  },
}));

vi.mock('../../../lib/env', () => ({ env: mocks.env }));

import { decryptSession, encryptSession, sessionValueFromCookieHeader } from '../../../lib/session';

type MutatingHandler = (request: Request) => Response | Promise<Response>;

interface RouteExports {
  GET?: MutatingHandler;
  POST?: MutatingHandler;
  PUT?: MutatingHandler;
  PATCH?: MutatingHandler;
  DELETE?: MutatingHandler;
}

/**
 * Handler registry (AC-M09.9): EVERY route module (each `route.ts` under
 * `app/api`) must be listed here (the completeness test fails otherwise) and
 * every mutating export must be wrapped with `withCsrf`, which the
 * foreign-origin / cross-site tests enforce behaviourally. Add new route files
 * to this map.
 */
const registry: Record<string, RouteExports> = {
  'auth/login/route.ts': loginRoute,
  'auth/logout/route.ts': logoutRoute,
  'health/route.ts': healthRoute,
};

const MUTATING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;

const API_DIR = fileURLToPath(new URL('..', import.meta.url));

function listRouteFiles(): string[] {
  return readdirSync(API_DIR, { recursive: true })
    .map((entry) => String(entry).replaceAll('\\', '/'))
    .filter((entry) => entry.endsWith('route.ts'))
    .sort();
}

// --- fake API ---------------------------------------------------------------

interface ReceivedRequest {
  url: string;
  method: string | undefined;
  authorization: string | undefined;
  body: string;
}

const apiRequests: ReceivedRequest[] = [];
let handleApi: (req: IncomingMessage, res: ServerResponse) => void = (_req, res) => {
  res.statusCode = 501;
  res.end('{}');
};
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      apiRequests.push({
        url: req.url ?? '',
        method: req.method,
        authorization:
          typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined,
        body,
      });
      handleApi(req, res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  mocks.env.API_URL = baseUrl;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
});

beforeEach(() => {
  apiRequests.length = 0;
  mocks.env.SESSION_SECRET = 'handlers-test-secret-0123456789abcdefgh';
  mocks.env.SESSION_SECRET_PREVIOUS = undefined;
  handleApi = (_req, res) => {
    res.statusCode = 501;
    res.end('{}');
  };
});

function jsonHandler(status: number, body: unknown) {
  return (_req: IncomingMessage, res: ServerResponse): void => {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(body));
  };
}

function authedRequest(
  path: string,
  options: { body?: string; headers?: Record<string, string> } = {},
): Request {
  return new Request(`http://web.test${path}`, {
    method: 'POST',
    headers: {
      origin: 'http://web.test',
      'sec-fetch-site': 'same-origin',
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...options.headers,
    },
    ...(options.body === undefined ? {} : { body: options.body }),
  });
}

const ACCESS = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdef123456';
const REFRESH = 'refresh-token-value-0123456789abcdef';

function tokenPair(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { accessToken: ACCESS, refreshToken: REFRESH, expiresIn: 900, ...overrides };
}

async function sessionCookieHeader(payload: {
  accessExp: number;
  accessToken?: string;
  refreshToken?: string;
}): Promise<string> {
  const value = await encryptSession({
    accessToken: payload.accessToken ?? ACCESS,
    refreshToken: payload.refreshToken ?? REFRESH,
    accessExp: payload.accessExp,
  });
  return `session=${value}`;
}

// --- registry ---------------------------------------------------------------

describe('route registry', () => {
  it('lists every app/api route file (add new handlers to the registry)', () => {
    expect(listRouteFiles()).toEqual(Object.keys(registry).sort());
  });

  for (const [file, routeModule] of Object.entries(registry)) {
    for (const method of MUTATING_METHODS) {
      const handler = routeModule[method];
      if (handler === undefined) {
        continue;
      }
      describe(`${method} ${file}`, () => {
        it('returns 403 with the error envelope for a foreign Origin', async () => {
          const response = await handler(
            new Request('http://web.test/probe', {
              method,
              headers: { origin: 'https://evil.com' },
            }),
          );

          expect(response.status).toBe(403);
          const body: unknown = JSON.parse(await response.text());
          expect(ErrorEnvelope.safeParse(body).success).toBe(true);
        });

        it('returns 403 for Sec-Fetch-Site: cross-site', async () => {
          const response = await handler(
            new Request('http://web.test/probe', {
              method,
              headers: { origin: 'http://web.test', 'sec-fetch-site': 'cross-site' },
            }),
          );

          expect(response.status).toBe(403);
          const body: unknown = JSON.parse(await response.text());
          expect(ErrorEnvelope.safeParse(body).success).toBe(true);
        });

        it('is reachable same-origin (no false 403)', async () => {
          const response = await handler(authedRequest('/probe', { body: '{}' }));
          expect(response.status).not.toBe(403);
        });
      });
    }
  }
});

// --- login ------------------------------------------------------------------

describe('POST /api/auth/login', () => {
  it('rejects invalid JSON with 400 before calling the API (AC-M09.12)', async () => {
    const response = await loginRoute.POST(
      authedRequest('/api/auth/login', { body: 'not json at all' }),
    );

    expect(response.status).toBe(400);
    expect(apiRequests).toHaveLength(0);
    const body: unknown = JSON.parse(await response.text());
    expect(ErrorEnvelope.safeParse(body).success).toBe(true);
  });

  it('rejects bodies that fail LoginInput with 400 before calling the API', async () => {
    const response = await loginRoute.POST(
      authedRequest('/api/auth/login', { body: JSON.stringify({ email: 'x' }) }),
    );

    expect(response.status).toBe(400);
    expect(apiRequests).toHaveLength(0);
  });

  it('returns {ok:true} with the session cookie and no tokens in the body', async () => {
    handleApi = jsonHandler(200, tokenPair());

    const response = await loginRoute.POST(
      authedRequest('/api/auth/login', {
        body: JSON.stringify({ email: 'a@b.com', password: 'secret' }),
      }),
    );

    expect(response.status).toBe(200);
    expect(apiRequests).toHaveLength(1);
    expect(apiRequests[0]?.url).toBe('/api/v1/auth/login');

    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ ok: true });
    expect(text).not.toMatch(/accessToken|refreshToken|eyJ[A-Za-z0-9_-]{8,}\.eyJ/);

    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie.startsWith('session=')).toBe(true);
    const value = sessionValueFromCookieHeader(setCookie.split(';')[0] ?? null);
    const stored = await decryptSession(value ?? '');
    expect(stored?.accessToken).toBe(ACCESS);
    expect(stored?.refreshToken).toBe(REFRESH);
    expect(typeof stored?.accessExp).toBe('number');
  });

  it('answers a generic 401 for bad credentials and sets no cookie', async () => {
    handleApi = jsonHandler(401, {
      error: { code: 'UNAUTHORIZED', message: 'Invalid credentials', requestId: 'api-rid' },
    });

    const response = await loginRoute.POST(
      authedRequest('/api/auth/login', {
        body: JSON.stringify({ email: 'a@b.com', password: 'wrong' }),
      }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toBeNull();
    const text = await response.text();
    expect(text).toContain('Invalid email or password');
    expect(text).not.toContain('Invalid credentials');
    expect(text).not.toMatch(/accessToken|refreshToken/);
  });

  it('answers a generic 429 when the API rate-limits', async () => {
    handleApi = jsonHandler(429, {
      error: { code: 'RATE_LIMITED', message: 'Too many requests', requestId: 'api-rid' },
    });

    const response = await loginRoute.POST(
      authedRequest('/api/auth/login', {
        body: JSON.stringify({ email: 'a@b.com', password: 'wrong' }),
      }),
    );

    expect(response.status).toBe(429);
    const text = await response.text();
    expect(text).not.toContain('Too many requests');
  });

  it('answers a generic 503 when the API fails or is unreachable', async () => {
    handleApi = jsonHandler(500, { error: { code: 'INTERNAL', message: 'boom', requestId: 'r' } });

    const response = await loginRoute.POST(
      authedRequest('/api/auth/login', {
        body: JSON.stringify({ email: 'a@b.com', password: 'secret' }),
      }),
    );

    expect(response.status).toBe(503);
    const text = await response.text();
    expect(text).not.toContain('boom');
    expect(text).not.toMatch(/accessToken|refreshToken/);
  });
});

// --- logout -----------------------------------------------------------------

describe('POST /api/auth/logout', () => {
  it('clears the cookie even when the API fails (AC-M09.5)', async () => {
    const cookie = await sessionCookieHeader({
      accessExp: Math.floor(Date.now() / 1000) + 600,
    });
    handleApi = jsonHandler(500, {
      error: { code: 'INTERNAL', message: 'boom', requestId: 'r' },
    });

    const response = await logoutRoute.POST(
      authedRequest('/api/auth/logout', { headers: { cookie } }),
    );

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ ok: true });
    expect(text).not.toMatch(/accessToken|refreshToken|eyJ[A-Za-z0-9_-]{8,}\.eyJ/);
    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie.startsWith('session=;')).toBe(true);
    expect(setCookie).toContain('Max-Age=0');
  });

  it('revokes the API session with the access token when it is still valid', async () => {
    const cookie = await sessionCookieHeader({
      accessExp: Math.floor(Date.now() / 1000) + 600,
    });
    handleApi = (_req, res) => {
      res.statusCode = 204;
      res.end();
    };

    const response = await logoutRoute.POST(
      authedRequest('/api/auth/logout', { headers: { cookie } }),
    );

    expect(response.status).toBe(200);
    expect(apiRequests).toHaveLength(1);
    expect(apiRequests[0]?.url).toBe('/api/v1/auth/logout');
    expect(apiRequests[0]?.authorization).toBe(`Bearer ${ACCESS}`);
  });

  it('refreshes first when the access token expired, then revokes (AC-M09.5)', async () => {
    const cookie = await sessionCookieHeader({
      accessExp: Math.floor(Date.now() / 1000) - 10,
    });
    handleApi = (req, res) => {
      if (req.url === '/api/v1/auth/refresh') {
        jsonHandler(200, tokenPair({ accessToken: 'fresh-access', refreshToken: 'fresh-refresh' }))(
          req,
          res,
        );
        return;
      }
      res.statusCode = 204;
      res.end();
    };

    const response = await logoutRoute.POST(
      authedRequest('/api/auth/logout', { headers: { cookie } }),
    );

    expect(response.status).toBe(200);
    expect(apiRequests.map((entry) => entry.url)).toEqual([
      '/api/v1/auth/refresh',
      '/api/v1/auth/logout',
    ]);
    expect(apiRequests[1]?.authorization).toBe('Bearer fresh-access');
    expect(apiRequests[0]?.body).toContain(REFRESH);
  });

  it('still clears the cookie when the refresh fails', async () => {
    const cookie = await sessionCookieHeader({
      accessExp: Math.floor(Date.now() / 1000) - 10,
    });
    handleApi = jsonHandler(401, {
      error: { code: 'UNAUTHORIZED', message: 'gone', requestId: 'r' },
    });

    const response = await logoutRoute.POST(
      authedRequest('/api/auth/logout', { headers: { cookie } }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie') ?? '').toContain('Max-Age=0');
  });

  it('clears the cookie without calling the API when there is no session', async () => {
    const response = await logoutRoute.POST(authedRequest('/api/auth/logout'));

    expect(response.status).toBe(200);
    expect(JSON.parse(await response.text())).toEqual({ ok: true });
    expect(apiRequests).toHaveLength(0);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });
});
