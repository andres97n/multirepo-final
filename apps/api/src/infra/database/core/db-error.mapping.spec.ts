import { describe, expect, it } from 'vitest';
import { mapDbError } from './db-error.mapping';
import {
  ConflictError,
  DbError,
  DbUnavailableError,
  InvalidQueryError,
  NotFoundError,
} from './errors';

describe('error classes', () => {
  it('set their own name and keep the message', () => {
    expect(new DbError('base').name).toBe('DbError');
    expect(new NotFoundError('missing').name).toBe('NotFoundError');
    expect(new ConflictError('sku').name).toBe('ConflictError');
    expect(new DbUnavailableError().name).toBe('DbUnavailableError');
    expect(new InvalidQueryError('bad').name).toBe('InvalidQueryError');
    expect(new NotFoundError('missing').message).toBe('missing');
    expect(new ConflictError('sku', 'dup').message).toBe('dup');
  });

  it('are DbError instances (so the filter branch matches)', () => {
    expect(new NotFoundError()).toBeInstanceOf(DbError);
    expect(new ConflictError()).toBeInstanceOf(DbError);
    expect(new DbUnavailableError()).toBeInstanceOf(DbError);
    expect(new InvalidQueryError()).toBeInstanceOf(DbError);
  });

  it('keep the cause when provided', () => {
    const cause = new Error('driver');
    const error = new DbUnavailableError('down', { cause });
    expect(error.cause).toBe(cause);
  });

  it('ConflictError exposes the optional field', () => {
    expect(new ConflictError('sku').field).toBe('sku');
    expect(new ConflictError().field).toBeUndefined();
  });
});

describe('mapDbError', () => {
  it('maps NotFoundError to 404 NOT_FOUND', () => {
    expect(mapDbError(new NotFoundError('nope'))).toEqual({
      status: 404,
      code: 'NOT_FOUND',
      message: 'nope',
    });
  });

  it('maps ConflictError to 409 CONFLICT with details.field when set', () => {
    expect(mapDbError(new ConflictError('sku'))).toEqual({
      status: 409,
      code: 'CONFLICT',
      message: 'Conflict',
      details: { field: 'sku' },
    });
    expect(mapDbError(new ConflictError())).toEqual({
      status: 409,
      code: 'CONFLICT',
      message: 'Conflict',
    });
  });

  it('maps InvalidQueryError to 400 VALIDATION_FAILED', () => {
    expect(mapDbError(new InvalidQueryError('unknown field'))).toEqual({
      status: 400,
      code: 'VALIDATION_FAILED',
      message: 'unknown field',
    });
  });

  it('maps DbUnavailableError to 503 SERVICE_UNAVAILABLE with a fixed message', () => {
    expect(mapDbError(new DbUnavailableError('mongodb://user:pass@host/db down'))).toEqual({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Database unavailable',
    });
  });

  it('maps an unknown DbError to 500 INTERNAL', () => {
    expect(mapDbError(new DbError('boom'))).toEqual({
      status: 500,
      code: 'INTERNAL',
      message: 'boom',
    });
  });

  it('returns undefined for non-DbError values', () => {
    expect(mapDbError(new Error('plain') as never)).toBeUndefined();
    expect(mapDbError('nope' as never)).toBeUndefined();
  });
});
