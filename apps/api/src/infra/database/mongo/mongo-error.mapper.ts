import { ConflictError, DbError, DbUnavailableError, InvalidQueryError } from '../core/errors';
import {
  BUFFERING_TIMEOUT_MARKER,
  DUPLICATE_KEY_CODE,
  INVALID_VALUE_ERROR_NAMES,
  UNAVAILABLE_ERROR_NAMES,
} from './mongo.constants';
import type { DriverErrorShape } from './mongo.types';

function asDriverError(error: unknown): DriverErrorShape | undefined {
  return typeof error === 'object' && error !== null ? error : undefined;
}

function firstKey(value: unknown): string | undefined {
  if (typeof value === 'object' && value !== null) {
    return Object.keys(value)[0];
  }
  return undefined;
}

function isUnavailable({ name, message }: DriverErrorShape): boolean {
  if (typeof name === 'string' && UNAVAILABLE_ERROR_NAMES.has(name)) {
    return true;
  }
  return (
    name === 'MongooseError' &&
    typeof message === 'string' &&
    message.includes(BUFFERING_TIMEOUT_MARKER)
  );
}

/**
 * Maps driver errors onto the core taxonomy: duplicate key → ConflictError(field),
 * unreachable server → DbUnavailableError, cast/validation failures (bad client
 * input) → InvalidQueryError (400, never driver text). Existing DbErrors pass
 * through; anything else is returned untouched for the caller to rethrow.
 */
export function mapMongoError(error: unknown): unknown {
  if (error instanceof DbError) {
    return error;
  }
  const driverError = asDriverError(error);
  if (driverError === undefined) {
    return error;
  }
  if (driverError.code === DUPLICATE_KEY_CODE) {
    const field = firstKey(driverError.keyPattern) ?? firstKey(driverError.keyValue);
    return new ConflictError(field, undefined, { cause: error });
  }
  if (isUnavailable(driverError)) {
    return new DbUnavailableError('Database unavailable', { cause: error });
  }
  if (typeof driverError.name === 'string' && INVALID_VALUE_ERROR_NAMES.has(driverError.name)) {
    return new InvalidQueryError('invalid value', { cause: error });
  }
  return error;
}
