import { ConflictError, DbError, DbUnavailableError, InvalidQueryError } from '../core/errors';
import {
  FOREIGN_KEY_VIOLATION,
  INVALID_VALUE_CODES,
  UNAVAILABLE_CODES,
  UNAVAILABLE_MESSAGE_MARKERS,
  UNAVAILABLE_NODE_CODES,
  UNIQUE_SUFFIX,
  UNIQUE_VIOLATION,
} from './postgres.constants';

interface DriverErrorShape {
  code?: unknown;
  constraint?: unknown;
  message?: unknown;
  cause?: unknown;
}

function asShape(value: unknown): DriverErrorShape | undefined {
  return typeof value === 'object' && value !== null ? value : undefined;
}

/** Drizzle wraps driver errors (`.cause`); the SQLSTATE lives on the inner one. */
function unwrap(error: unknown): DriverErrorShape | undefined {
  const outer = asShape(error);
  const inner = asShape(outer?.cause);
  return outer?.code === undefined && inner !== undefined ? inner : outer;
}

function isUnavailable({ code, message }: DriverErrorShape): boolean {
  if (typeof code === 'string' && (code.startsWith('08') || UNAVAILABLE_CODES.has(code))) {
    return true;
  }
  if (typeof code === 'string' && UNAVAILABLE_NODE_CODES.has(code)) {
    return true;
  }
  return (
    typeof message === 'string' && UNAVAILABLE_MESSAGE_MARKERS.some((m) => message.includes(m))
  );
}

/** `<table>_<column>_unique` → property name via `fieldByColumn` (falls back to the column). */
function conflictField(
  constraint: unknown,
  tableName: string,
  fieldByColumn: ReadonlyMap<string, string>,
): string | undefined {
  const prefix = `${tableName}_`;
  if (
    typeof constraint !== 'string' ||
    !constraint.startsWith(prefix) ||
    !constraint.endsWith(UNIQUE_SUFFIX)
  ) {
    return undefined;
  }
  const column = constraint.slice(prefix.length, constraint.length - UNIQUE_SUFFIX.length);
  return fieldByColumn.get(column) ?? column;
}

/**
 * Maps driver errors onto the core taxonomy: unique violation →
 * ConflictError(field), unreachable server → DbUnavailableError, bad client
 * data (class 22, NOT NULL/CHECK) → InvalidQueryError. Existing DbErrors pass
 * through; anything else is returned untouched for the caller to rethrow.
 */
export function mapPostgresError(
  error: unknown,
  tableName: string,
  fieldByColumn: ReadonlyMap<string, string>,
): unknown {
  if (error instanceof DbError) {
    return error;
  }
  const driverError = unwrap(error);
  if (driverError === undefined) {
    return error;
  }
  const { code } = driverError;
  if (code === UNIQUE_VIOLATION) {
    const field = conflictField(driverError.constraint, tableName, fieldByColumn);
    return new ConflictError(field, undefined, { cause: error });
  }
  if (code === FOREIGN_KEY_VIOLATION) {
    return new ConflictError(undefined, undefined, { cause: error });
  }
  if (isUnavailable(driverError)) {
    return new DbUnavailableError('Database unavailable', { cause: error });
  }
  if (typeof code === 'string' && (code.startsWith('22') || INVALID_VALUE_CODES.has(code))) {
    return new InvalidQueryError('invalid value', { cause: error });
  }
  return error;
}
