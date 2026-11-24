import 'server-only';

import { ErrorEnvelope, type ErrorCode } from '@repo/contracts';
import { headers } from 'next/headers';
import type { z } from 'zod';

import { env } from './env';
import { resolveRequestId } from './request-id';

/** Appends the ` [requestId:<id>]` suffix `ApiError` messages carry so `error.tsx` can show the id. */
export function withRequestId(message: string, requestId: string): string {
  return `${message} [requestId:${requestId}]`;
}

/**
 * Typed API error. `message` always ends with ` [requestId:<id>]`.
 *
 * `digest` carries the same bracketed id: in production React Flight replaces
 * error messages with a generic one and only transmits `digest`
 * (`react-server-dom-webpack` `emitErrorChunk`/`resolveErrorProd`), and the
 * error row is the only error channel that reaches the SSR body (React Fizz
 * does not run error boundaries server-side, so `error.tsx` renders after
 * hydration). The bracketed format keeps the id greppable in the raw response
 * and extractable with the plan's `REQUEST_ID_MESSAGE_PATTERN`.
 */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly requestId: string;
  readonly details?: unknown;
  /** Next/React error channel; ` [requestId:<id>]` so it survives prod error obfuscation. */
  readonly digest: string;

  constructor(
    message: string,
    options: {
      code: ErrorCode;
      status: number;
      requestId: string;
      details?: unknown;
      cause?: unknown;
    },
  ) {
    super(withRequestId(message, options.requestId), { cause: options.cause });
    this.name = 'ApiError';
    this.code = options.code;
    this.status = options.status;
    this.requestId = options.requestId;
    this.digest = `[requestId:${options.requestId}]`;
    if (options.details !== undefined) {
      this.details = options.details;
    }
  }
}

/** Thrown when the API did not answer within the configured timeout. */
export class ApiTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number, options?: { cause?: unknown }) {
    super(`API request timed out after ${String(timeoutMs)}ms`, { cause: options?.cause });
    this.name = 'ApiTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/**
 * True when the API could not be reached at all (timeout or network failure).
 * Envelope errors (the API answered with a status >= 400) are "reachable" and
 * must propagate to `error.tsx`.
 */
export function isApiUnreachable(error: unknown): boolean {
  return (
    error instanceof ApiTimeoutError ||
    (error instanceof ApiError && error.code === 'SERVICE_UNAVAILABLE' && error.status === 0)
  );
}

export interface ApiRequestOptions {
  /** Explicit outgoing request id (tests); otherwise forwarded from the incoming request. */
  requestId?: string;
  /** Access token sent as `authorization: Bearer <token>` (BFF auth calls). */
  token?: string;
  /** Overrides `env.API_TIMEOUT_MS`. */
  timeoutMs?: number;
  /** Fetch cache mode; defaults to `no-store` (server-side BFF calls are never cached). */
  cache?: RequestCache;
  /** Non-2xx responses whose body already matches `schema` are returned, not thrown (readiness 503 `Health`). */
  acceptErrorBody?: boolean;
}

/** GET `path` from the API and validate the response with `schema`. */
export async function apiGet<T>(
  path: string,
  schema: z.ZodType<T>,
  options: ApiRequestOptions = {},
): Promise<T> {
  return apiRequest<T>('GET', path, undefined, schema, options);
}

/** POST `body` to `path` and validate the response with `schema`. */
export async function apiPost<T>(
  path: string,
  body: unknown,
  schema: z.ZodType<T>,
  options: ApiRequestOptions = {},
): Promise<T> {
  return apiRequest<T>('POST', path, body, schema, options);
}

async function resolveIncomingRequestId(): Promise<string> {
  const incoming = await headers();
  return resolveRequestId(incoming.get('x-request-id'));
}

async function apiRequest<T>(
  method: string,
  path: string,
  body: unknown,
  schema: z.ZodType<T>,
  options: ApiRequestOptions,
): Promise<T> {
  const requestId = options.requestId ?? (await resolveIncomingRequestId());
  const timeoutMs = options.timeoutMs ?? env.API_TIMEOUT_MS;

  const requestHeaders: Record<string, string> = {
    accept: 'application/json',
    'x-request-id': requestId,
  };
  if (options.token !== undefined) {
    requestHeaders['authorization'] = `Bearer ${options.token}`;
  }
  if (body !== undefined) {
    requestHeaders['content-type'] = 'application/json';
  }

  let response: Response;
  try {
    response = await fetch(`${env.API_URL}${path}`, {
      method,
      headers: requestHeaders,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: options.cache ?? 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw toTransportError(error, requestId, timeoutMs);
  }

  return handleResponse(response, schema, requestId, options.acceptErrorBody === true);
}

function toTransportError(error: unknown, requestId: string, timeoutMs: number): Error {
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return new ApiTimeoutError(timeoutMs, { cause: error });
  }
  return new ApiError('API request failed: service unreachable', {
    code: 'SERVICE_UNAVAILABLE',
    status: 0,
    requestId,
    cause: error,
  });
}

async function handleResponse<T>(
  response: Response,
  schema: z.ZodType<T>,
  sentRequestId: string,
  acceptErrorBody: boolean,
): Promise<T> {
  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = undefined;
  }

  if (!response.ok) {
    if (acceptErrorBody) {
      const accepted = schema.safeParse(body);
      if (accepted.success) {
        return accepted.data;
      }
    }
    const envelope = ErrorEnvelope.safeParse(body);
    if (envelope.success) {
      throw new ApiError(envelope.data.error.message, {
        code: envelope.data.error.code,
        status: response.status,
        requestId:
          envelope.data.error.requestId || response.headers.get('x-request-id') || sentRequestId,
        details: envelope.data.error.details,
      });
    }
    throw new ApiError('API returned a non-envelope error response', {
      code: 'INTERNAL',
      status: response.status,
      requestId: response.headers.get('x-request-id') || sentRequestId,
    });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError('API returned an invalid response body', {
      code: 'INTERNAL',
      status: response.status,
      requestId: response.headers.get('x-request-id') || sentRequestId,
    });
  }
  return parsed.data;
}
