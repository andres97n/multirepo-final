import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { Health } from '@repo/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { env } from '../../../lib/env';
import { GET } from './route';

vi.mock('../../../lib/env', () => ({ env: { API_URL: '', API_TIMEOUT_MS: 1000 } }));

let handler: (req: IncomingMessage, res: ServerResponse) => void = healthOkHandler;
let server: Server;
let baseUrl: string;

function healthOkHandler(_req: IncomingMessage, res: ServerResponse): void {
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ status: 'ok', checks: { database: { status: 'ok' } } }));
}

beforeAll(async () => {
  server = createServer((req, res) => {
    handler(req, res);
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
  handler = healthOkHandler;
  env.API_TIMEOUT_MS = 1000;
});

describe('GET /api/health', () => {
  it('returns 200 Health with web liveness', async () => {
    const response = await GET(new Request('http://localhost:3000/api/health'));
    const body = (await response.json()) as Health;

    expect(response.status).toBe(200);
    expect(() => Health.parse(body)).not.toThrow();
    expect(body).toEqual({ status: 'ok', checks: { web: { status: 'ok' } } });
  });

  it('echoes the x-request-id header', async () => {
    const response = await GET(
      new Request('http://localhost:3000/api/health', {
        headers: { 'x-request-id': 'live-check-rid-123' },
      }),
    );

    expect(response.headers.get('x-request-id')).toBe('live-check-rid-123');
  });

  it('deep=1 returns 200 with checks.api when the api is ok', async () => {
    const response = await GET(new Request('http://localhost:3000/api/health?deep=1'));
    const body = (await response.json()) as Health;

    expect(response.status).toBe(200);
    expect(() => Health.parse(body)).not.toThrow();
    expect(body.checks).toEqual({
      web: { status: 'ok' },
      api: { status: 'ok' },
    });
  });

  it('deep=1 returns 503 with status down when the api is unreachable', async () => {
    env.API_URL = 'http://127.0.0.1:1';

    const response = await GET(new Request('http://localhost:3000/api/health?deep=1'));
    const body = (await response.json()) as Health;

    expect(response.status).toBe(503);
    expect(() => Health.parse(body)).not.toThrow();
    expect(body.status).toBe('down');
    expect(body.checks.api).toEqual({ status: 'down', message: 'API unreachable' });
    env.API_URL = baseUrl;
  });

  it('deep=1 returns 503 when the api reports not ok', async () => {
    handler = (_req, res) => {
      res.statusCode = 503;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ status: 'down', checks: { database: { status: 'down' } } }));
    };

    const response = await GET(new Request('http://localhost:3000/api/health?deep=1'));
    const body = (await response.json()) as Health;

    expect(response.status).toBe(503);
    expect(body.status).toBe('down');
  });
});
