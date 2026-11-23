import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Writable } from 'node:stream';
import { pino } from 'pino';
import { pinoHttp } from 'pino-http';
import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../../config/env.schema';
import { buildPinoHttpOptions, redactConfig } from './logger.module';

// Core fields only: module fragments (db-*) are optional per build.
const baseConfig = {
  NODE_ENV: 'production',
  PORT: 3001,
  TRUST_PROXY: 0,
  CORS_ORIGIN: ['https://example.com'],
  THROTTLE_TTL_MS: 60000,
  THROTTLE_LIMIT: 100,
  LOG_LEVEL: 'info',
  API_DOCS_ENABLED: false,
} as AppConfig;

function capture(): { stream: Writable; lines: string[] } {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(String(chunk));
      callback();
    },
  });
  return { stream, lines };
}

describe('pino redaction (AC-M03.9)', () => {
  it('redacts authorization, cookie, password and token fields', () => {
    const { stream, lines } = capture();
    const logger = pino({ level: 'info', redact: redactConfig }, stream);

    logger.info(
      {
        req: {
          headers: {
            authorization: 'Bearer secret-token-value',
            cookie: 'session=super-secret-session',
          },
        },
        res: { headers: { 'set-cookie': 'sid=set-cookie-secret' } },
        credentials: {
          password: 'hunter2-password',
          token: 'top-secret-token',
          refreshToken: 'refresh-secret',
          accessToken: 'access-secret',
        },
        nested: { password: 'nested-secret' },
      },
      'redaction check',
    );

    const line = lines.join('');
    expect(line).toContain('[REDACTED]');
    expect(line).not.toContain('secret-token-value');
    expect(line).not.toContain('super-secret-session');
    expect(line).not.toContain('set-cookie-secret');
    expect(line).not.toContain('hunter2-password');
    expect(line).not.toContain('top-secret-token');
    expect(line).not.toContain('refresh-secret');
    expect(line).not.toContain('access-secret');
    expect(line).not.toContain('nested-secret');
  });
});

describe('request log JSON shape (AC-M03.14)', () => {
  it('emits single-line JSON with level, time, requestId, req, res and responseTime', () => {
    const { stream, lines } = capture();
    const options = buildPinoHttpOptions(baseConfig, stream);
    const httpLogger = pinoHttp(options);

    const req = {
      id: 'req-123',
      method: 'GET',
      url: '/api/v1/health/live',
      headers: { authorization: 'Bearer secret-token-value' },
      readableAborted: false,
    } as unknown as IncomingMessage;

    const res = Object.assign(new EventEmitter(), {
      statusCode: 200,
      headersSent: true,
      writableEnded: true,
    }) as unknown as ServerResponse;

    httpLogger(req, res, () => {});
    res.emit('finish');

    const line = JSON.parse(lines.join('')) as Record<string, unknown>;
    expect(line.level).toBe(30);
    expect(typeof line.time).toBe('number');
    expect(line.requestId).toBe('req-123');
    expect(line.req).toEqual({ id: 'req-123', method: 'GET', url: '/api/v1/health/live' });
    expect(line.res).toEqual({ statusCode: 200 });
    expect(typeof line.responseTime).toBe('number');
    // Headers are stripped by the minimal req serializer, not merely redacted.
    expect(JSON.stringify(line)).not.toContain('secret-token-value');
  });
});

describe('userId in request logs (AC-M06.15)', () => {
  function requestLine(req: Record<string, unknown>): Record<string, unknown> {
    const { stream, lines } = capture();
    const options = buildPinoHttpOptions(baseConfig, stream);
    const httpLogger = pinoHttp(options);
    const res = Object.assign(new EventEmitter(), {
      statusCode: 200,
      headersSent: true,
      writableEnded: true,
    }) as unknown as ServerResponse;
    httpLogger(req as unknown as IncomingMessage, res, () => {});
    res.emit('finish');
    return JSON.parse(lines.join('')) as Record<string, unknown>;
  }

  it('adds userId when the auth guard attached req.user', () => {
    const line = requestLine({
      id: 'req-9',
      method: 'GET',
      url: '/api/v1/auth/me',
      user: { id: 'user-42', roles: ['user'], sid: 'session-9' },
    });
    expect(line.userId).toBe('user-42');
    expect(line.requestId).toBe('req-9');
    // Only the id crosses over — never roles, sid, headers or the token.
    expect(JSON.stringify(line)).not.toContain('session-9');
  });

  it('omits userId for anonymous requests', () => {
    const line = requestLine({ id: 'req-8', method: 'GET', url: '/api/v1/health/live' });
    expect(line).not.toHaveProperty('userId');
  });
});
