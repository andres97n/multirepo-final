import { describe, expect, it } from 'vitest';
import {
  ConflictError,
  DbUnavailableError,
  InvalidQueryError,
  NotFoundError,
} from '../core/errors';
import { mapMongoError } from './mongo-error.mapper';

const named = (name: string, extra: object = {}): Error =>
  Object.assign(new Error('driver text mongodb://u:p@host/db'), { name, ...extra });

describe('mapMongoError', () => {
  it('maps E11000 to ConflictError with the first key pattern field', () => {
    const error = mapMongoError({ code: 11000, keyPattern: { sku: 1 } });
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).field).toBe('sku');
  });

  it('falls back to keyValue for the conflict field', () => {
    expect((mapMongoError({ code: 11000, keyValue: { email: 'a' } }) as ConflictError).field).toBe(
      'email',
    );
  });

  it.each(['MongooseServerSelectionError', 'MongoNetworkError', 'MongoServerSelectionError'])(
    'maps %s to DbUnavailableError',
    (name) => {
      expect(mapMongoError(named(name))).toBeInstanceOf(DbUnavailableError);
    },
  );

  it('maps a buffering timeout to DbUnavailableError', () => {
    const error = Object.assign(new Error('Operation buffering timed out'), {
      name: 'MongooseError',
    });
    expect(mapMongoError(error)).toBeInstanceOf(DbUnavailableError);
  });

  it.each(['CastError', 'ValidationError'])(
    'maps %s to InvalidQueryError without driver text',
    (name) => {
      const mapped = mapMongoError(named(name));
      expect(mapped).toBeInstanceOf(InvalidQueryError);
      expect((mapped as Error).message).toBe('invalid value');
    },
  );

  it('passes DbErrors and unknown values through untouched', () => {
    const notFound = new NotFoundError();
    expect(mapMongoError(notFound)).toBe(notFound);
    const other = new Error('boom');
    expect(mapMongoError(other)).toBe(other);
    expect(mapMongoError('string')).toBe('string');
  });
});
