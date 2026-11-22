import { ErrorCodes, type ErrorCode } from '@repo/contracts';
import {
  ConflictError,
  DbError,
  DbUnavailableError,
  InvalidQueryError,
  NotFoundError,
} from './errors';

export interface MappedDbError {
  status: number;
  code: ErrorCode;
  message: string;
  details?: unknown;
}

/**
 * Pure mapping from a {@link DbError} to the HTTP status / contract code /
 * envelope message. `undefined` means "not a mapped DbError" (the caller falls
 * back to its own handling). Driver messages and connection URIs are never
 * included.
 */
export function mapDbError(e: DbError): MappedDbError | undefined {
  if (e instanceof DbUnavailableError) {
    return { status: 503, code: ErrorCodes.SERVICE_UNAVAILABLE, message: 'Database unavailable' };
  }
  if (e instanceof NotFoundError) {
    return { status: 404, code: ErrorCodes.NOT_FOUND, message: e.message };
  }
  if (e instanceof ConflictError) {
    return {
      status: 409,
      code: ErrorCodes.CONFLICT,
      message: e.message,
      ...(e.field !== undefined ? { details: { field: e.field } } : {}),
    };
  }
  if (e instanceof InvalidQueryError) {
    return { status: 400, code: ErrorCodes.VALIDATION_FAILED, message: e.message };
  }
  if (e instanceof DbError) {
    return { status: 500, code: ErrorCodes.INTERNAL, message: e.message };
  }
  return undefined;
}
