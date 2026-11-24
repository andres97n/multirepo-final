import 'server-only';

import { env } from './env';
import { resolveRequestId } from './request-id';

/**
 * CSRF protection for cookie-authenticated mutations (AC-M09.9): a same-origin
 * `Origin` (falling back to `Referer`) must equal `APP_ORIGIN`, and
 * `Sec-Fetch-Site`, when the browser sends it, must be `same-origin` or
 * `none`. Browsers attach `Origin` to every POST, so the primary check holds
 * even without fetch metadata; `Sec-Fetch-Site` is an additional check.
 * Rejections return the standard error envelope with 403.
 */

/** Thrown by `assertSameOrigin`; converted to a 403 envelope by `withCsrf`. */
export class CsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsrfError';
  }
}

function requestOrigin(request: Request): string | null {
  const header = request.headers.get('origin') ?? request.headers.get('referer');
  if (header === null) {
    return null;
  }
  try {
    return new URL(header).origin;
  } catch {
    return null;
  }
}

/**
 * Throws `CsrfError` unless the request proves same-origin: `Origin`
 * (`Referer` fallback) must equal `APP_ORIGIN`, both missing is a rejection,
 * and `Sec-Fetch-Site`, if present, must be `same-origin` or `none`.
 */
export function assertSameOrigin(request: Request): void {
  const origin = requestOrigin(request);
  if (origin === null || origin !== new URL(env.APP_ORIGIN).origin) {
    throw new CsrfError('Cross-origin request rejected');
  }
  const secFetchSite = request.headers.get('sec-fetch-site');
  if (secFetchSite !== null && secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
    throw new CsrfError('Cross-site request rejected');
  }
}

/** 403 response in the shared error envelope. */
export function csrfForbiddenResponse(request: Request): Response {
  const requestId = resolveRequestId(request.headers.get('x-request-id'));
  return Response.json(
    {
      error: {
        code: 'FORBIDDEN',
        message: 'Cross-origin request rejected',
        requestId,
      },
    },
    { status: 403, headers: { 'x-request-id': requestId } },
  );
}

export type RouteHandler = (request: Request) => Response | Promise<Response>;

/** Wraps a mutating route handler with `assertSameOrigin` (403 envelope on rejection). */
export function withCsrf(handler: RouteHandler): RouteHandler {
  return async (request: Request): Promise<Response> => {
    try {
      assertSameOrigin(request);
    } catch {
      return csrfForbiddenResponse(request);
    }
    return handler(request);
  };
}
