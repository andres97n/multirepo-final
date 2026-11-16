import { describe, expect, it } from 'vitest';
import { generateRequestId, isValidRequestId, resolveRequestId } from './request-id';

const UUID_V4 = '123e4567-e89b-12d3-a456-426614174000';
const ULID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

describe('isValidRequestId', () => {
  it('accepts a uuid', () => {
    expect(isValidRequestId(UUID_V4)).toBe(true);
  });

  it('accepts a ulid', () => {
    expect(isValidRequestId(ULID)).toBe(true);
  });

  it('rejects a 200-character value', () => {
    expect(isValidRequestId('a'.repeat(200))).toBe(false);
  });

  it('rejects <script>', () => {
    expect(isValidRequestId('<script>')).toBe(false);
  });

  it('rejects non-strings and empty values', () => {
    expect(isValidRequestId(undefined)).toBe(false);
    expect(isValidRequestId('')).toBe(false);
    expect(isValidRequestId(123)).toBe(false);
  });
});

describe('resolveRequestId', () => {
  it('echoes a valid uuid', () => {
    expect(resolveRequestId(UUID_V4)).toBe(UUID_V4);
  });

  it('echoes a valid ulid', () => {
    expect(resolveRequestId(ULID)).toBe(ULID);
  });

  it('replaces a 200-character value with a fresh valid id', () => {
    const incoming = 'a'.repeat(200);
    const resolved = resolveRequestId(incoming);
    expect(resolved).not.toBe(incoming);
    expect(isValidRequestId(resolved)).toBe(true);
  });

  it('replaces <script> with a fresh valid id', () => {
    const resolved = resolveRequestId('<script>');
    expect(resolved).not.toBe('<script>');
    expect(isValidRequestId(resolved)).toBe(true);
  });

  it('generates valid ids', () => {
    expect(isValidRequestId(generateRequestId())).toBe(true);
  });
});
