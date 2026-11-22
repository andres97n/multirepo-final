/** Internal DI tokens for the node-postgres pool and the Drizzle instance. */
export const POSTGRES_POOL = Symbol('POSTGRES_POOL');
export const POSTGRES_DB = Symbol('POSTGRES_DB');

export const DEFAULT_DATABASE_URL = 'postgres://app:app@localhost:5432/app';
export const DEFAULT_POSTGRES_TIMEOUT_MS = 3000;
export const DEFAULT_POSTGRES_POOL_MAX = 10;
export const DEFAULT_POSTGRES_IDLE_TIMEOUT_MS = 30000;
export const DATABASE_URL_PATTERN = /^postgres(ql)?:\/\//;

/** SQLSTATE codes the adapter maps (https://www.postgresql.org/docs/current/errcodes-appendix.html). */
export const UNIQUE_VIOLATION = '23505';
export const FOREIGN_KEY_VIOLATION = '23503';
export const INVALID_VALUE_CODES: ReadonlySet<string> = new Set(['23502', '23514']);
/** Connection-class errors (08xxx) and server shutdown codes mean "unreachable". */
export const UNAVAILABLE_CODES: ReadonlySet<string> = new Set(['57P01', '57P02', '57P03']);
export const UNAVAILABLE_NODE_CODES: ReadonlySet<string> = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EPIPE',
]);
export const UNAVAILABLE_MESSAGE_MARKERS: readonly string[] = [
  'timeout exceeded when trying to connect',
  'Connection terminated',
  'Client has encountered a connection error',
];

/** Unique constraints must be named `<table>_<column>_unique` (ADR-0005). */
export const UNIQUE_SUFFIX = '_unique';

/** Fields a caller may never write: identity and timestamps are adapter-owned. */
export const RESERVED_WRITE_KEYS: readonly string[] = [
  'id',
  '_id',
  'createdAt',
  'updatedAt',
  'created_at',
  'updated_at',
];
