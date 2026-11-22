import { Module } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Writable } from 'node:stream';
import { pinoHttp } from 'pino-http';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { requestIdMiddleware } from '../../common/middleware/request-id.middleware';
import type { AppConfig } from '../../config/env.schema';
import { buildPinoHttpOptions } from './logger.module';

@Module({})
class EmptyModule {}

const config: AppConfig = {
  NODE_ENV: 'production',
  PORT: 3001,
  TRUST_PROXY: 0,
  CORS_ORIGIN: ['https://example.com'],
  THROTTLE_TTL_MS: 60000,
  THROTTLE_LIMIT: 100,
  LOG_LEVEL: 'info',
  API_DOCS_ENABLED: false,
  MONGO_URI: 'mongodb://localhost:27017/app',
  MONGO_TIMEOUT_MS: 3000,
};

describe('request id in the log line (AC-M03.5)', () => {
  it('logs the response-header requestId (even for an invalid incoming id) and a query-free url', async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(String(chunk));
        callback();
      },
    });
    const moduleRef = await Test.createTestingModule({ imports: [EmptyModule] }).compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>();
    app.use(requestIdMiddleware);
    app.use(pinoHttp(buildPinoHttpOptions(config, stream)));
    app.use((_req: unknown, res: { end: (body: string) => void }) => {
      res.end('ok');
    });
    await app.init();

    const res = await request(app.getHttpServer())
      .get('/x?token=abc')
      .set('x-request-id', '<script>');
    await vi.waitFor(() => {
      expect(lines.length).toBeGreaterThan(0);
    });
    const first = lines.join('').trim().split('\n')[0] ?? '{}';
    const line = JSON.parse(first) as { requestId?: string; req?: { url?: string } };

    expect(res.headers['x-request-id']).not.toBe('<script>');
    expect(line.requestId).toBe(res.headers['x-request-id']);
    expect(line.req?.url).toBe('/x');
    await app.close();
  });
});
