import { Body, Controller, Get, Post } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { asErrorEnvelope, buildApp, withEnv } from './helpers';

class CreateItemDto extends createZodDto(z.object({ name: z.string().min(3) })) {}

@Controller('test-only')
class TestOnlyController {
  @Post('items')
  create(@Body() body: CreateItemDto): CreateItemDto {
    return body;
  }

  @Get('boom')
  boom(): never {
    throw new Error('kaboom');
  }
}

describe('errors (AC-M03.2, AC-M03.3, AC-M03.4)', () => {
  it('invalid body -> 400 VALIDATION_FAILED with field details and requestId', async () => {
    const app = await buildApp([TestOnlyController]);
    const res = await request(app.getHttpServer())
      .post('/api/v1/test-only/items')
      .send({ name: 'x' });
    const envelope = asErrorEnvelope(res.body);
    expect(res.status).toBe(400);
    expect(envelope.error.code).toBe('VALIDATION_FAILED');
    expect(envelope.error.requestId).toBeTruthy();
    expect(envelope.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'name' })]),
    );
    await app.close();
  });

  it('malformed JSON body -> 400 envelope with requestId', async () => {
    const app = await buildApp([TestOnlyController]);
    const res = await request(app.getHttpServer())
      .post('/api/v1/test-only/items')
      .set('content-type', 'application/json')
      .send('{bad');
    const envelope = asErrorEnvelope(res.body);
    expect(res.status).toBe(400);
    expect(envelope.error.code).toBe('VALIDATION_FAILED');
    expect(envelope.error.requestId).toBe(res.headers['x-request-id']);
    await app.close();
  });

  it('unknown route -> 404 NOT_FOUND with the same id in the body and header', async () => {
    const app = await buildApp();
    const res = await request(app.getHttpServer()).get('/api/v1/nope');
    const envelope = asErrorEnvelope(res.body);
    expect(res.status).toBe(404);
    expect(envelope.error.code).toBe('NOT_FOUND');
    expect(envelope.error.requestId).toBe(res.headers['x-request-id']);
    await app.close();
  });

  it('unknown error -> 500 INTERNAL with no stack/message leakage in production', async () => {
    await withEnv({ NODE_ENV: 'production', CORS_ORIGIN: 'https://example.com' }, async () => {
      const app = await buildApp([TestOnlyController]);
      const res = await request(app.getHttpServer()).get('/api/v1/test-only/boom');
      const envelope = asErrorEnvelope(res.body);
      expect(res.status).toBe(500);
      expect(envelope.error.code).toBe('INTERNAL');
      expect(envelope.error.message).toBe('Internal server error');
      expect(envelope.error.requestId).toBe(res.headers['x-request-id']);
      expect(JSON.stringify(res.body)).not.toContain('kaboom');
      expect(JSON.stringify(res.body)).not.toContain('at ');
      await app.close();
    });
  });
});
