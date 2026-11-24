import { LoginInput, TokenPair } from '@repo/contracts/auth';
import type { ErrorCode } from '@repo/contracts';

import { ApiError, apiPost } from '../../../../lib/api-client.server';
import { withCsrf } from '../../../../lib/csrf';
import { resolveRequestId } from '../../../../lib/request-id';
import { buildSessionCookie, encryptSession } from '../../../../lib/session';

/** 4xx/5xx body in the shared error envelope; never tokens or API details. */
function errorResponse(
  status: number,
  code: ErrorCode,
  message: string,
  requestId: string,
): Response {
  return Response.json(
    { error: { code, message, requestId } },
    { status, headers: { 'x-request-id': requestId } },
  );
}

function validationError(requestId: string): Response {
  return errorResponse(400, 'VALIDATION_FAILED', 'Invalid login request body', requestId);
}

/** Maps API failures to generic 401/429/503 messages (AC-M09.1). */
function loginFailure(error: unknown, requestId: string): Response {
  if (error instanceof ApiError && error.status === 401) {
    return errorResponse(401, 'UNAUTHORIZED', 'Invalid email or password', requestId);
  }
  if (error instanceof ApiError && error.status === 429) {
    return errorResponse(
      429,
      'RATE_LIMITED',
      'Too many attempts, please try again later',
      requestId,
    );
  }
  return errorResponse(503, 'SERVICE_UNAVAILABLE', 'Authentication service unavailable', requestId);
}

/**
 * `POST /api/auth/login` (BFF). Validates `LoginInput` BEFORE calling the API
 * (AC-M09.12), seals the returned tokens into the encrypted session cookie and
 * answers `{ ok: true }` — tokens never reach the browser (AC-M09.11).
 */
async function login(request: Request): Promise<Response> {
  const requestId = resolveRequestId(request.headers.get('x-request-id'));

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationError(requestId);
  }
  const parsed = LoginInput.safeParse(body);
  if (!parsed.success) {
    return validationError(requestId);
  }

  try {
    const tokens = await apiPost('/api/v1/auth/login', parsed.data, TokenPair, { requestId });
    const value = await encryptSession({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessExp: Math.floor(Date.now() / 1000) + tokens.expiresIn,
    });
    return Response.json(
      { ok: true },
      {
        status: 200,
        headers: {
          'set-cookie': buildSessionCookie(value),
          'x-request-id': requestId,
        },
      },
    );
  } catch (error) {
    return loginFailure(error, requestId);
  }
}

export const POST = withCsrf(login);
