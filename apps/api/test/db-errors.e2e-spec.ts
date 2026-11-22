import { Controller, Get } from '@nestjs/common';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  ConflictError,
  DbUnavailableError,
  InvalidQueryError,
  NotFoundError,
} from '../src/infra/database/core';
import { asErrorEnvelope, buildApp } from './helpers';

@Controller('db-errors-test')
class DbErrorsTestController {
  @Get('not-found')
  notFound(): never {
    throw new NotFoundError('Widget not found');
  }

  @Get('conflict')
  conflict(): never {
    throw new ConflictError('email');
  }

  @Get('unavailable')
  unavailable(): never {
    throw new DbUnavailableError();
  }

  @Get('invalid-query')
  invalidQuery(): never {
    throw new InvalidQueryError('field not allowed: secret');
  }
}

describe('database error envelopes (M04)', () => {
  it('maps every DbError subclass onto the uniform envelope with requestId', async () => {
    const app = await buildApp([DbErrorsTestController]);
    try {
      const notFound = await request(app.getHttpServer()).get('/api/v1/db-errors-test/not-found');
      expect(notFound.status).toBe(404);
      const notFoundEnvelope = asErrorEnvelope(notFound.body);
      expect(notFoundEnvelope.error.code).toBe('NOT_FOUND');
      expect(notFoundEnvelope.error.message).toBe('Widget not found');
      expect(notFoundEnvelope.error.requestId).toBeTruthy();
      expect(notFoundEnvelope.error.details).toBeUndefined();

      const conflict = await request(app.getHttpServer()).get('/api/v1/db-errors-test/conflict');
      expect(conflict.status).toBe(409);
      const conflictEnvelope = asErrorEnvelope(conflict.body);
      expect(conflictEnvelope.error.code).toBe('CONFLICT');
      expect(conflictEnvelope.error.details).toEqual({ field: 'email' });
      expect(conflictEnvelope.error.requestId).toBeTruthy();

      const unavailable = await request(app.getHttpServer()).get(
        '/api/v1/db-errors-test/unavailable',
      );
      expect(unavailable.status).toBe(503);
      const unavailableEnvelope = asErrorEnvelope(unavailable.body);
      expect(unavailableEnvelope.error.code).toBe('SERVICE_UNAVAILABLE');
      expect(unavailableEnvelope.error.requestId).toBeTruthy();

      const invalidQuery = await request(app.getHttpServer()).get(
        '/api/v1/db-errors-test/invalid-query',
      );
      expect(invalidQuery.status).toBe(400);
      const invalidEnvelope = asErrorEnvelope(invalidQuery.body);
      expect(invalidEnvelope.error.code).toBe('VALIDATION_FAILED');
      expect(invalidEnvelope.error.requestId).toBeTruthy();
    } finally {
      await app.close();
    }
  });
});
