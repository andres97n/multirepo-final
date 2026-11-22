/** Base class for every error surfaced by a database port (adapter-agnostic). */
export class DbError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'DbError';
  }
}

/** The requested entity does not exist (or its id is malformed). */
export class NotFoundError extends DbError {
  constructor(message = 'Resource not found', options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'NotFoundError';
  }
}

/** A uniqueness violation (duplicate unique key). */
export class ConflictError extends DbError {
  constructor(
    readonly field?: string,
    message = 'Conflict',
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'ConflictError';
  }
}

/** The database is unreachable / not ready. */
export class DbUnavailableError extends DbError {
  constructor(message = 'Database unavailable', options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'DbUnavailableError';
  }
}

/** Non-whitelisted field/op/sort or a malformed value → HTTP 400. */
export class InvalidQueryError extends DbError {
  constructor(message = 'Invalid query', options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'InvalidQueryError';
  }
}
