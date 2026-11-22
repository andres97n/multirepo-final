import type { Connection, Types } from 'mongoose';

/** Raw Mongoose document shape for an entity `T` (adds `_id`/`__v`). */
export type MongoDocument<T> = T & { _id: Types.ObjectId; __v?: number };

export type MongoFilter = Record<string, unknown>;
export type MongoSort = Record<string, 1 | -1>;

/** Loop/lifecycle state shared by the connection providers. */
export interface MongoRuntime {
  connection: Connection;
  /** True once the module is shutting down; stops the background retry loop. */
  isClosed(): boolean;
  markClosed(): void;
}

/** The fields of a driver error the adapter inspects. */
export interface DriverErrorShape {
  code?: unknown;
  keyPattern?: unknown;
  keyValue?: unknown;
  name?: unknown;
  message?: unknown;
}
