import type { RefreshInput } from '@repo/contracts/auth';
import { TokenPair } from '@repo/contracts/auth';
import { z } from 'zod';

import { apiPost } from '../../../../lib/api-client.server';
import { withCsrf } from '../../../../lib/csrf';
import { resolveRequestId } from '../../../../lib/request-id';
import { buildClearSessionCookie, readSessionFromRequest } from '../../../../lib/session';

/**
 * `POST /api/auth/logout` (BFF). Revokes the API session best effort — first
 * refreshing when the access token already expired, so the logout really
 * revokes the session family — and ALWAYS clears the cookie (AC-M09.5).
 */
async function logout(request: Request): Promise<Response> {
  const requestId = resolveRequestId(request.headers.get('x-request-id'));
  const session = await readSessionFromRequest(request);

  if (session !== null) {
    try {
      let accessToken = session.accessToken;
      if (session.accessExp * 1000 <= Date.now()) {
        try {
          const refreshBody: RefreshInput = { refreshToken: session.refreshToken };
          const pair = await apiPost('/api/v1/auth/refresh', refreshBody, TokenPair, {
            requestId,
          });
          accessToken = pair.accessToken;
        } catch {
          // Fall back to the expired token: logout stays best effort.
        }
      }
      await apiPost('/api/v1/auth/logout', undefined, z.undefined(), {
        token: accessToken,
        requestId,
      });
    } catch {
      // Best effort: the cookie is cleared whatever the API answers.
    }
  }

  return Response.json(
    { ok: true },
    {
      status: 200,
      headers: {
        'set-cookie': buildClearSessionCookie(),
        'x-request-id': requestId,
      },
    },
  );
}

export const POST = withCsrf(logout);
