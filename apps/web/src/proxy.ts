import { NextResponse, type NextRequest } from 'next/server';

import { buildCsp, securityHeaders } from './lib/csp';
import { resolveRequestId } from './lib/request-id';
// @module:auth
import { authProxy } from './lib/auth-proxy';
// @end-module:auth

/**
 * Per-request headers for DYNAMIC routes only (AC-M08.8 / AC-M08.9):
 * - a fresh CSP nonce, applied by Next to its `<script>`/`<style>` tags;
 * - `x-request-id`, validated or generated, echoed on the response and set on
 *   the request headers so RSC / route handlers read the same id;
 * - the shared security headers and the nonce-based CSP on the response.
 *
 * Static routes never reach this file (see the matcher): a nonce would force
 * them to render dynamically, so they get the nonce-less policy from
 * `next.config.ts` `headers()` instead.
 */
export default async function proxy(request: NextRequest): Promise<NextResponse> {
  const nonce = btoa(crypto.randomUUID());
  const requestId = resolveRequestId(request.headers.get('x-request-id'));
  const csp = buildCsp({
    nonce,
    isDev: process.env.NODE_ENV === 'development',
    reportUri: process.env.CSP_REPORT_URI,
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  // Next extracts the nonce from the request CSP header and applies it to its
  // scripts/styles during server rendering.
  requestHeaders.set('content-security-policy', csp);
  requestHeaders.set('x-request-id', requestId);

  // `Set-Cookie` values for the continued response (auth refresh rotation).
  const pendingCookies: string[] = [];
  // Module guards may short-circuit with a redirect. A list (not a bare await)
  // keeps this function valid when `modules:apply` removes every guard.
  const guards: Promise<NextResponse | null>[] = [
    // @module:auth
    authProxy(request, requestHeaders, pendingCookies),
    // @end-module:auth
  ];
  const redirect = (await Promise.all(guards)).find((result) => result !== null);
  if (redirect) {
    return redirect;
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('content-security-policy', csp);
  for (const [key, value] of Object.entries(
    securityHeaders({ isProd: process.env.NODE_ENV === 'production' }),
  )) {
    response.headers.set(key, value);
  }
  response.headers.set('x-request-id', requestId);
  for (const cookie of pendingCookies) {
    response.headers.append('set-cookie', cookie);
  }
  return response;
}

/**
 * Matcher: everything except static assets and the statically prerendered
 * pages (`/about`), which keep their static (○) rendering and
 * the `next.config.ts` headers. `missing` skips `next/link` prefetches so a
 * per-request nonce never lands in a cached prefetch response (recommended by
 * the Next 16 CSP guide) and auth redirects never hijack a prefetch. Add every
 * new static page to the exclusion list. Constants only: Next statically
 * analyses the matcher.
 */
export const config = {
  matcher: [
    {
      source:
        '/((?!_next/static|_next/image|favicon\\.ico|favicon\\.png|about/?$|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|avif|css|js|mjs|map|txt|xml|json|woff2?|ttf|otf|eot)$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
