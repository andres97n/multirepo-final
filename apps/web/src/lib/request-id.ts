/**
 * Request-id helpers. Client-safe (no `server-only`, no `next/*`): used by
 * `src/proxy.ts`, `src/lib/api-client.server.ts` and the client error pages.
 */

/** Suffix `ApiError` messages carry so `error.tsx` can show the id (prod-safe). */
const REQUEST_ID_PATTERN = /\s*\[requestId:([A-Za-z0-9._-]+)\]\s*$/;

/** Regex exported for tests; matches the ` [requestId:<id>]` message suffix. */
export const REQUEST_ID_MESSAGE_PATTERN = REQUEST_ID_PATTERN;

/**
 * Extracts the request id encoded in an error message by `withRequestId`
 * (`src/lib/api-client.server.ts`). Returns `undefined` when absent.
 */
export function extractRequestIdFromMessage(message: string): string | undefined {
  return REQUEST_ID_PATTERN.exec(message)?.[1];
}

const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * An incoming id is accepted when it is 1-64 chars of `[A-Za-z0-9._-]` (uuids,
 * ulids and plain trace ids like `live-check-rid-123` all pass); anything else
 * (empty, too long, `<script>`, …) is rejected and replaced. Deliberately
 * wider than the API's uuid/ulid rule: web forwards arbitrary trace ids, and
 * the API re-mints when it wants a stricter id.
 */
export function isValidRequestId(value: unknown): value is string {
  return typeof value === 'string' && VALID_REQUEST_ID.test(value);
}

/** Generates a fresh request id (uuid v4). */
export function generateRequestId(): string {
  return crypto.randomUUID();
}

/** Echoes a valid incoming id, otherwise generates a fresh uuid. */
export function resolveRequestId(incoming: unknown): string {
  return isValidRequestId(incoming) ? incoming : generateRequestId();
}
