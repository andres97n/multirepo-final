import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { Health } from '@repo/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { headers } from 'next/headers';

import {
  ApiError,
  apiGet,
  apiPost,
  ApiTimeoutError,
  isApiUnreachable,
  withRequestId,
} from './api-client.server';
import { env } from './env';
import { extractRequestIdFromMessage, isValidRequestId } from './request-id';

vi.mock('next/headers', () => ({ headers: vi.fn() }));
vi.mock('./env', () => ({ env: { API_URL: '', API_TIMEOUT_MS: 1000 } }));

const mockedHeaders = vi.mocked(headers);

interface ReceivedRequest {
  url: string;
  method: string | undefined;
  requestId: string | undefined;
  body: string;
}

const received: ReceivedRequest[] = [];
let handler: (req: IncomingMessage, res: ServerResponse) => void = healthOkHandler;
let server: Server;
let baseUrl: string;

function healthOkHandler(_req: IncomingMessage, res: ServerResponse): void {
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ status: 'ok', checks: { database: { status: 'ok' } } }));
}

function setIncomingRequestId(value: string | undefined): void {
  mockedHeaders.mockResolvedValue(
    new Headers(value === undefined ? {} : { 'x-request-id': value }),
  );
}

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      const headerId = req.headers['x-request-id'];
      received.push({
        url: req.url ?? '',
        method: req.method,
        requestId: typeof headerId === 'string' ? headerId : undefined,
        body,
      });
      handler(req, res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  env.API_URL = baseUrl;
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
  received.length = 0;
  handler = healthOkHandler;
  env.API_TIMEOUT_MS = 1000;
  setIncomingRequestId('live-check-rid-123');
});

describe('apiGet', () => {
  it('parses a success body with the contract schema (Health)', async () => {
    const health = await apiGet('/api/v1/health/ready', Health);

    expect(health).toEqual({ status: 'ok', checks: { database: { status: 'ok' } } });
    expect(received[0]?.requestId).toBe('live-check-rid-123');
  });

  it('parses a success body with a locally built schema', async () => {
    handler = (_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ data: { id: 'u1' } }));
    };
    const body = await apiGet('/users/me', z.object({ data: z.object({ id: z.string() }) }));

    expect(body).toEqual({ data: { id: 'u1' } });
  });
});

describe('apiPost', () => {
  it('sends the body as JSON and forwards the request id', async () => {
    handler = (_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ data: { id: 'u1' } }));
    };

    const body = await apiPost(
      '/users',
      { email: 'a@b.co' },
      z.object({ data: z.object({ id: z.string() }) }),
    );

    expect(body).toEqual({ data: { id: 'u1' } });
    expect(received[0]?.method).toBe('POST');
    expect(received[0]?.body).toBe(JSON.stringify({ email: 'a@b.co' }));
  });
});

describe('error mapping', () => {
  it('throws a typed ApiError with code and requestId from the envelope', async () => {
    handler = (_req, res) => {
      res.statusCode = 404;
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          error: { code: 'NOT_FOUND', message: 'no such thing', requestId: 'envelope-rid-1' },
        }),
      );
    };

    const error = await apiGet('/missing', Health).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.code).toBe('NOT_FOUND');
    expect(apiError.status).toBe(404);
    expect(apiError.requestId).toBe('envelope-rid-1');
    expect(apiError.digest).toBe('[requestId:envelope-rid-1]');
    expect(apiError.message).toBe(withRequestId('no such thing', 'envelope-rid-1'));
    expect(extractRequestIdFromMessage(apiError.message)).toBe('envelope-rid-1');
  });

  it('returns a 503 Health body only when acceptErrorBody is set', async () => {
    handler = (_req, res) => {
      res.statusCode = 503;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ status: 'down', checks: { database: { status: 'down' } } }));
    };

    await expect(apiGet('/ready', Health, { acceptErrorBody: true })).resolves.toMatchObject({
      status: 'down',
    });
    await expect(apiGet('/ready', Health)).rejects.toBeInstanceOf(ApiError);
  });

  it('throws ApiError INTERNAL when the error body is not an envelope', async () => {
    handler = (_req, res) => {
      res.statusCode = 500;
      res.setHeader('content-type', 'text/html');
      res.setHeader('x-request-id', 'header-rid-2');
      res.end('<html>boom</html>');
    };

    const error = (await apiGet('/broken', Health).catch((e: unknown) => e)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('INTERNAL');
    expect(error.status).toBe(500);
    expect(error.requestId).toBe('header-rid-2');
  });

  it('throws ApiError INTERNAL on an invalid success body', async () => {
    handler = (_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ wrong: true }));
    };

    const error = (await apiGet('/weird', Health).catch((e: unknown) => e)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('INTERNAL');
    expect(error.requestId).toBe('live-check-rid-123');
    expect(extractRequestIdFromMessage(error.message)).toBe('live-check-rid-123');
  });

  it('throws ApiError INTERNAL on a non-JSON success body', async () => {
    handler = (_req, res) => {
      res.end('not json');
    };

    const error = (await apiGet('/weird', Health).catch((e: unknown) => e)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('INTERNAL');
  });

  it('throws ApiTimeoutError after the configured ms', async () => {
    handler = () => {
      // Never respond: the client must time out.
    };

    const error = (await apiGet('/slow', Health, { timeoutMs: 50 }).catch(
      (e: unknown) => e,
    )) as ApiTimeoutError;

    expect(error).toBeInstanceOf(ApiTimeoutError);
    expect(error.timeoutMs).toBe(50);
  });

  it('throws ApiError SERVICE_UNAVAILABLE when the network fails', async () => {
    env.API_URL = 'http://127.0.0.1:1';

    const error = (await apiGet('/down', Health).catch((e: unknown) => e)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('SERVICE_UNAVAILABLE');
    expect(error.status).toBe(0);
    env.API_URL = baseUrl;
  });
});

describe('x-request-id handling (AC-M08.5)', () => {
  it('forwards a valid incoming x-request-id to the api', async () => {
    setIncomingRequestId('live-check-rid-123');
    await apiGet('/api/v1/health/ready', Health);

    expect(received[0]?.requestId).toBe('live-check-rid-123');
  });

  it('generates a fresh id when the incoming x-request-id is invalid', async () => {
    setIncomingRequestId('<script>alert(1)</script>');
    await apiGet('/api/v1/health/ready', Health);

    const sent = received[0]?.requestId;
    expect(sent).not.toBe('<script>alert(1)</script>');
    expect(isValidRequestId(sent)).toBe(true);
  });

  it('generates a fresh id when no x-request-id is incoming', async () => {
    setIncomingRequestId(undefined);
    await apiGet('/api/v1/health/ready', Health);

    expect(isValidRequestId(received[0]?.requestId)).toBe(true);
  });

  it('sends the explicit requestId option when provided', async () => {
    await apiGet('/api/v1/health/ready', Health, { requestId: 'explicit-rid-7' });

    expect(received[0]?.requestId).toBe('explicit-rid-7');
  });
});

describe('isApiUnreachable', () => {
  it('is true for timeouts and network failures only', async () => {
    handler = () => {
      // hang
    };
    const timeoutError = await apiGet('/slow', Health, { timeoutMs: 50 }).catch((e: unknown) => e);
    expect(isApiUnreachable(timeoutError)).toBe(true);

    env.API_URL = 'http://127.0.0.1:1';
    const networkError = await apiGet('/down', Health).catch((e: unknown) => e);
    expect(isApiUnreachable(networkError)).toBe(true);
    env.API_URL = baseUrl;

    handler = (_req, res) => {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: { code: 'INTERNAL', message: 'boom', requestId: 'rid-9' } }));
    };
    const envelopeError = await apiGet('/broken', Health).catch((e: unknown) => e);
    expect(isApiUnreachable(envelopeError)).toBe(false);
  });
});
