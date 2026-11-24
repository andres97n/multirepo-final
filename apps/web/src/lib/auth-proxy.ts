import { TokenPair } from '@repo/contracts/auth';
import { type NextRequest, NextResponse } from 'next/server';

import { apiPost } from './api-client.server';
import { env } from './env';
import { resolveRequestId } from './request-id';
import {
  buildClearSessionCookie,
  buildSessionCookie,
  decryptSession,
  encryptSession,
  sessionValueFromCookieHeader,
  setSessionCookieHeader,
} from './session';

/**
 * Route protection + transparent token refresh for `src/proxy.ts`
 * (AC-M09.2..4). Paths under the protected prefixes need a valid session
 * cookie; a missing or undecryptable cookie redirects to `/login?next=<path>`
 * (clearing a bad cookie), an access token expiring within
 * `SESSION_REFRESH_SKEW_SECONDS` is refreshed in place (the new cookie lands on
 * the request cookies — the same render sees it — and on the response), and any
 * refresh failure clears the cookie and redirects.
 */

/** Paths that require a session. */
export const PROTECTED_PREFIXES = ['/dashboard'];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function loginRedirect(request: NextRequest, clearCookie: boolean): NextResponse {
  const { pathname, search } = request.nextUrl;
  const target = `/login?next=${encodeURIComponent(`${pathname}${search}`)}`;
  const requestId = resolveRequestId(request.headers.get('x-request-id'));
  const response = NextResponse.redirect(new URL(target, request.url));
  response.headers.set('x-request-id', requestId);
  if (clearCookie) {
    response.headers.append('set-cookie', buildClearSessionCookie());
  }
  return response;
}

/**
 * Returns a redirect response when the request must not continue, or `null`
 * when it may. `setCookies` collects `Set-Cookie` values to append to the
 * continued response (refresh rotation); the rewritten session cookie is also
 * written to `requestHeaders` so the rendering request reads the new tokens.
 */
export async function authProxy(
  request: NextRequest,
  requestHeaders: Headers,
  setCookies: string[],
): Promise<NextResponse | null> {
  const { pathname } = request.nextUrl;
  if (!isProtectedPath(pathname)) {
    return null;
  }

  const raw = sessionValueFromCookieHeader(requestHeaders.get('cookie'));
  const session = raw === null ? null : await decryptSession(raw);
  if (session === null) {
    return loginRedirect(request, raw !== null);
  }

  const nowSeconds = Date.now() / 1000;
  if (session.accessExp - nowSeconds > env.SESSION_REFRESH_SKEW_SECONDS) {
    return null;
  }

  try {
    const pair = await apiPost(
      '/api/v1/auth/refresh',
      { refreshToken: session.refreshToken },
      TokenPair,
      { requestId: resolveRequestId(request.headers.get('x-request-id')) },
    );
    const value = await encryptSession({
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      accessExp: Math.floor(Date.now() / 1000) + pair.expiresIn,
    });
    requestHeaders.set('cookie', setSessionCookieHeader(requestHeaders.get('cookie'), value));
    setCookies.push(buildSessionCookie(value));
    return null;
  } catch {
    return loginRedirect(request, true);
  }
}
