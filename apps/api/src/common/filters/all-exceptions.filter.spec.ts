import { type ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { ZodValidationException } from 'nestjs-zod';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { AppConfig } from '../../config/app-config';
import {
  ConflictError,
  DbError,
  DbUnavailableError,
  InvalidQueryError,
  NotFoundError,
} from '../../infra/database/core';
import {
  AllExceptionsFilter,
  httpStatusToErrorCode,
  zodIssuesToDetails,
} from './all-exceptions.filter';

const baseConfig: AppConfig = {
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

interface Captured {
  status: number;
  body: {
    error: {
      code: string;
      message: string;
      requestId: string;
      details?: unknown;
    };
  };
}

function runFilter(exception: unknown, config: AppConfig = baseConfig): Captured {
  const captured: Captured = {
    status: 0,
    body: { error: { code: '', message: '', requestId: '' } },
  };
  const response = {
    status(code: number) {
      captured.status = code;
      return response;
    },
    json(body: Captured['body']) {
      captured.body = body;
      return response;
    },
  };
  const request = { id: 'req-123', headers: {} };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;

  new AllExceptionsFilter(config, { error: () => {} }).catch(exception, host);
  return captured;
}

describe('httpStatusToErrorCode', () => {
  it.each([
    [400, 'VALIDATION_FAILED'],
    [401, 'UNAUTHORIZED'],
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
    [409, 'CONFLICT'],
    [429, 'RATE_LIMITED'],
    [500, 'INTERNAL'],
    [503, 'SERVICE_UNAVAILABLE'],
    [418, 'INTERNAL'],
  ] as const)('maps %i to %s', (status, code) => {
    expect(httpStatusToErrorCode(status)).toBe(code);
  });
});

describe('zodIssuesToDetails', () => {
  it('maps each issue to a { path, message } entry', () => {
    const schema = z.object({
      email: z.email(),
      nested: z.object({ age: z.number().min(18) }),
    });
    const result = schema.safeParse({ email: 'nope', nested: { age: 3 } });
    expect(result.success).toBe(false);
    if (!result.success) {
      const details = zodIssuesToDetails(result.error);
      expect(details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: 'email' }),
          expect.objectContaining({ path: 'nested.age' }),
        ]),
      );
    }
  });
});

describe('AllExceptionsFilter.catch', () => {
  it('maps a ZodError to 400 VALIDATION_FAILED with field details', () => {
    const schema = z.object({ name: z.string().min(3) });
    const result = schema.safeParse({ name: 'x' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const captured = runFilter(result.error);
      expect(captured.status).toBe(400);
      expect(captured.body.error.code).toBe('VALIDATION_FAILED');
      expect(captured.body.error.requestId).toBe('req-123');
      expect(captured.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'name' })]),
      );
    }
  });

  it('maps a ZodValidationException to 400 VALIDATION_FAILED', () => {
    const schema = z.object({ name: z.string().min(3) });
    const result = schema.safeParse({ name: 'x' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const captured = runFilter(new ZodValidationException(result.error));
      expect(captured.status).toBe(400);
      expect(captured.body.error.code).toBe('VALIDATION_FAILED');
    }
  });

  it.each([
    [HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED'],
    [HttpStatus.FORBIDDEN, 'FORBIDDEN'],
    [HttpStatus.NOT_FOUND, 'NOT_FOUND'],
    [HttpStatus.CONFLICT, 'CONFLICT'],
    [HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED'],
    [HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED'],
  ] as const)('maps HttpException %i to %s', (status, code) => {
    const captured = runFilter(new HttpException('boom', status));
    expect(captured.status).toBe(status);
    expect(captured.body.error.code).toBe(code);
    expect(captured.body.error.requestId).toBe('req-123');
  });

  it('returns a generic message and no stack for unknown errors in production', () => {
    const captured = runFilter(new Error('secret internal detail'));
    expect(captured.status).toBe(500);
    expect(captured.body.error.code).toBe('INTERNAL');
    expect(captured.body.error.message).toBe('Internal server error');
    expect(JSON.stringify(captured.body)).not.toContain('secret internal detail');
  });

  it('returns the error message for unknown errors outside production', () => {
    const devConfig: AppConfig = { ...baseConfig, NODE_ENV: 'development' };
    const captured = runFilter(new Error('dev detail'), devConfig);
    expect(captured.status).toBe(500);
    expect(captured.body.error.code).toBe('INTERNAL');
    expect(captured.body.error.message).toBe('dev detail');
  });
});

describe('AllExceptionsFilter.catch with DbErrors (M04)', () => {
  it('maps NotFoundError to 404 NOT_FOUND', () => {
    const captured = runFilter(new NotFoundError('Widget not found'));
    expect(captured.status).toBe(404);
    expect(captured.body.error.code).toBe('NOT_FOUND');
    expect(captured.body.error.message).toBe('Widget not found');
    expect(captured.body.error.details).toBeUndefined();
    expect(captured.body.error.requestId).toBe('req-123');
  });

  it('maps ConflictError with a field to 409 CONFLICT with details.field', () => {
    const captured = runFilter(new ConflictError('email'));
    expect(captured.status).toBe(409);
    expect(captured.body.error.code).toBe('CONFLICT');
    expect(captured.body.error.details).toEqual({ field: 'email' });
  });

  it('maps ConflictError without a field to 409 CONFLICT with no details', () => {
    const captured = runFilter(new ConflictError());
    expect(captured.status).toBe(409);
    expect(captured.body.error.code).toBe('CONFLICT');
    expect(captured.body.error.details).toBeUndefined();
  });

  it('maps InvalidQueryError to 400 VALIDATION_FAILED', () => {
    const captured = runFilter(new InvalidQueryError('unknown field: secret'));
    expect(captured.status).toBe(400);
    expect(captured.body.error.code).toBe('VALIDATION_FAILED');
    expect(captured.body.error.message).toBe('unknown field: secret');
  });

  it('maps DbUnavailableError to 503 SERVICE_UNAVAILABLE with a generic message in production', () => {
    const captured = runFilter(new DbUnavailableError());
    expect(captured.status).toBe(503);
    expect(captured.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(captured.body.error.message).toBe('Internal server error');
    expect(captured.body.error.details).toBeUndefined();
  });

  it('keeps the mapped message for DbUnavailableError outside production', () => {
    const devConfig: AppConfig = { ...baseConfig, NODE_ENV: 'development' };
    const captured = runFilter(
      new DbUnavailableError('driver said: connect ECONNREFUSED'),
      devConfig,
    );
    expect(captured.status).toBe(503);
    expect(captured.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(captured.body.error.message).toBe('Database unavailable');
  });

  it('maps a plain DbError to 500 INTERNAL', () => {
    const captured = runFilter(new DbError('boom'));
    expect(captured.status).toBe(500);
    expect(captured.body.error.code).toBe('INTERNAL');
  });

  it('logs 5xx DbErrors via logger.error with the requestId', () => {
    const errors: Array<Record<string, unknown>> = [];
    const captured: Captured = {
      status: 0,
      body: { error: { code: '', message: '', requestId: '' } },
    };
    const response = {
      status(code: number) {
        captured.status = code;
        return response;
      },
      json(body: Captured['body']) {
        captured.body = body;
        return response;
      },
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({ id: 'req-123', headers: {} }),
      }),
    } as unknown as ArgumentsHost;
    new AllExceptionsFilter(baseConfig, {
      error: (payload: Record<string, unknown>, msg: string) => {
        errors.push({ ...payload, msg });
      },
    }).catch(new DbUnavailableError(), host);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.msg).toBe('DbError 5xx');
    expect(errors[0]?.requestId).toBe('req-123');
  });
});
