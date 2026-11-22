/** Internal DI token for the Mongoose connection handle (adapters/models). */
export const MONGO_CONNECTION = Symbol('MONGO_CONNECTION');

/** Internal DI token for the connection lifecycle state. */
export const MONGO_RUNTIME = Symbol('MONGO_RUNTIME');

export const DEFAULT_MONGO_URI = 'mongodb://localhost:27017/app';
export const DEFAULT_MONGO_TIMEOUT_MS = 3000;
export const MONGO_URI_PATTERN = /^mongodb(\+srv)?:\/\//;

/** MongoDB server error code for a duplicate key (E11000). */
export const DUPLICATE_KEY_CODE = 11000;

/** Driver/mongoose error names that mean "the database is unreachable". */
export const UNAVAILABLE_ERROR_NAMES: ReadonlySet<string> = new Set([
  'MongooseServerSelectionError',
  'MongoNetworkError',
  'MongoServerSelectionError',
]);
export const BUFFERING_TIMEOUT_MARKER = 'buffering timed out';

/** Error names raised when a value cannot be cast/validated against the schema. */
export const INVALID_VALUE_ERROR_NAMES: ReadonlySet<string> = new Set([
  'CastError',
  'ValidationError',
]);

/** Fields a caller may never write: identity is owned by the adapter. */
export const RESERVED_WRITE_KEYS: readonly string[] = ['id', '_id', '__v'];
