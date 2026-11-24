import { ErrorEnvelope } from '@repo/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: {
    API_URL: 'http://localhost:3001',
    API_TIMEOUT_MS: 5000,
    APP_ORIGIN: 'http://localhost:3000',
    SESSION_SECRET: 'csrf-test-secret-0123456789abcdefghijk',
    SESSION_MAX_AGE_SECONDS: 3600,
    SESSION_REFRESH_SKEW_SECONDS: 60,
  },
}));

vi.mock('./env', () => ({ env: mocks.env }));

import { assertSameOrigin, CsrfError, withCsrf } from './csrf';

function request(headers: Record<string, string>): Request {
  return new Request('http://localhost:3000/api/auth/login', { method: 'POST', headers });
}

beforeEach(() => {
  mocks.env.APP_ORIGIN = 'http://localhost:3000';
});

describe('assertSameOrigin', () => {
  it('accepts a matching Origin', () => {
    expect(() => {
      assertSameOrigin(request({ origin: 'http://localhost:3000' }));
    }).not.toThrow();
  });

  it('accepts a matching Origin when APP_ORIGIN carries a path', () => {
    mocks.env.APP_ORIGIN = 'http://localhost:3000/app/';
    expect(() => {
      assertSameOrigin(request({ origin: 'http://localhost:3000' }));
    }).not.toThrow();
  });

  it('falls back to Referer when Origin is missing', () => {
    expect(() => {
      assertSameOrigin(request({ referer: 'http://localhost:3000/dashboard?tab=1' }));
    }).not.toThrow();
  });

  it('accepts Sec-Fetch-Site same-origin and none', () => {
    expect(() => {
      assertSameOrigin(
        request({ origin: 'http://localhost:3000', 'sec-fetch-site': 'same-origin' }),
      );
    }).not.toThrow();
    expect(() => {
      assertSameOrigin(request({ origin: 'http://localhost:3000', 'sec-fetch-site': 'none' }));
    }).not.toThrow();
  });

  it('rejects when both Origin and Referer are missing', () => {
    expect(() => {
      assertSameOrigin(request({}));
    }).toThrow(CsrfError);
  });

  it('rejects a foreign Origin', () => {
    expect(() => {
      assertSameOrigin(request({ origin: 'https://evil.com' }));
    }).toThrow(CsrfError);
    expect(() => {
      assertSameOrigin(request({ origin: 'http://localhost:3000.evil.com' }));
    }).toThrow(CsrfError);
  });

  it('rejects a foreign Origin even when Referer matches', () => {
    expect(() => {
      assertSameOrigin(request({ origin: 'https://evil.com', referer: 'http://localhost:3000/' }));
    }).toThrow(CsrfError);
  });

  it('rejects a foreign Referer fallback', () => {
    expect(() => {
      assertSameOrigin(request({ referer: 'https://evil.com/page' }));
    }).toThrow(CsrfError);
  });

  it('rejects unparseable Origin and Referer values', () => {
    expect(() => {
      assertSameOrigin(request({ origin: 'not a url' }));
    }).toThrow(CsrfError);
    expect(() => {
      assertSameOrigin(request({ referer: 'javascript:alert(1)' }));
    }).toThrow(CsrfError);
  });

  it('rejects Sec-Fetch-Site cross-site, same-site and any other value', () => {
    for (const site of ['cross-site', 'same-site', 'other']) {
      expect(() => {
        assertSameOrigin(request({ origin: 'http://localhost:3000', 'sec-fetch-site': site }));
      }).toThrow(CsrfError);
    }
  });
});

describe('withCsrf', () => {
  const handler = vi.fn((): Promise<Response> => Promise.resolve(Response.json({ ok: true })));

  beforeEach(() => {
    handler.mockClear();
  });

  it('runs the handler for same-origin requests', async () => {
    const wrapped = withCsrf(handler);
    const response = await wrapped(request({ origin: 'http://localhost:3000' }));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('returns the 403 error envelope without running the handler', async () => {
    const wrapped = withCsrf(handler);
    const response = await wrapped(
      request({ origin: 'https://evil.com', 'x-request-id': 'rid-42' }),
    );

    expect(handler).not.toHaveBeenCalled();
    expect(response.status).toBe(403);
    expect(response.headers.get('x-request-id')).toBe('rid-42');
    const body: unknown = await response.json();
    const envelope = ErrorEnvelope.safeParse(body);
    expect(envelope.success).toBe(true);
    if (envelope.success) {
      expect(envelope.data.error.code).toBe('FORBIDDEN');
      expect(envelope.data.error.requestId).toBe('rid-42');
    }
  });

  it('returns 403 for Sec-Fetch-Site cross-site with a valid Origin', async () => {
    const wrapped = withCsrf(handler);
    const response = await wrapped(
      request({ origin: 'http://localhost:3000', 'sec-fetch-site': 'cross-site' }),
    );

    expect(handler).not.toHaveBeenCalled();
    expect(response.status).toBe(403);
    const body: unknown = await response.json();
    expect(ErrorEnvelope.safeParse(body).success).toBe(true);
  });

  it('mints a request id for the envelope when the request has none', async () => {
    const wrapped = withCsrf(handler);
    const response = await wrapped(request({}));

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { requestId: string } };
    expect(body.error.requestId).toMatch(/^[A-Za-z0-9._-]{1,64}$/);
  });
});
