import { v7 as uuidv7 } from 'uuid';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ULID_PATTERN = /^[0-9a-hjkmnp-tv-z]{26}$/i;
const MAX_LENGTH = 64;

/**
 * An incoming request id is accepted only when it is a uuid or a ulid and no
 * longer than 64 characters; anything else (e.g. a long string or `<script>`)
 * is rejected.
 */
export function isValidRequestId(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_LENGTH) {
    return false;
  }
  return UUID_PATTERN.test(value) || ULID_PATTERN.test(value);
}

export function generateRequestId(): string {
  return uuidv7();
}

/** Echoes a valid incoming id, otherwise generates a fresh uuid v7. */
export function resolveRequestId(incoming: unknown): string {
  return isValidRequestId(incoming) ? incoming : generateRequestId();
}
