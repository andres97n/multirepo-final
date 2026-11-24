import { describe, expect, it } from 'vitest';

import {
  extractRequestIdFromMessage,
  generateRequestId,
  isValidRequestId,
  resolveRequestId,
  REQUEST_ID_MESSAGE_PATTERN,
} from './request-id';

describe('extractRequestIdFromMessage', () => {
  it('extracts the id from the [requestId:<id>] suffix', () => {
    expect(extractRequestIdFromMessage('boom [requestId:abc-123]')).toBe('abc-123');
    expect(
      extractRequestIdFromMessage('boom [requestId:0193f2c1-7f0b-7cc3-b8f0-9c2c1a2b3c4d]'),
    ).toBe('0193f2c1-7f0b-7cc3-b8f0-9c2c1a2b3c4d');
  });

  it('returns undefined when there is no suffix', () => {
    expect(extractRequestIdFromMessage('plain message')).toBeUndefined();
    expect(extractRequestIdFromMessage('')).toBeUndefined();
    expect(extractRequestIdFromMessage('boom [requestId:]')).toBeUndefined();
  });

  it('exports the regex used for extraction', () => {
    expect(REQUEST_ID_MESSAGE_PATTERN.test('x [requestId:r-1]')).toBe(true);
    expect(REQUEST_ID_MESSAGE_PATTERN.test('x [requestId:r-1] trailing')).toBe(false);
  });
});

describe('isValidRequestId', () => {
  it('accepts uuids, ulids and plain trace ids', () => {
    expect(isValidRequestId('0193f2c1-7f0b-7cc3-b8f0-9c2c1a2b3c4d')).toBe(true);
    expect(isValidRequestId('01ARZ3NDEKTSV4RRFFQ69G5FAV')).toBe(true);
    expect(isValidRequestId('live-check-rid-123')).toBe(true);
  });

  it('rejects empty, oversized and hostile values', () => {
    expect(isValidRequestId('')).toBe(false);
    expect(isValidRequestId('a'.repeat(65))).toBe(false);
    expect(isValidRequestId('<script>alert(1)</script>')).toBe(false);
    expect(isValidRequestId(42)).toBe(false);
    expect(isValidRequestId(undefined)).toBe(false);
    expect(isValidRequestId('id with spaces')).toBe(false);
  });
});

describe('generateRequestId', () => {
  it('generates a valid unique id', () => {
    const id = generateRequestId();
    expect(isValidRequestId(id)).toBe(true);
    expect(id).not.toBe(generateRequestId());
  });
});

describe('resolveRequestId', () => {
  it('forwards a valid incoming id', () => {
    expect(resolveRequestId('live-check-rid-123')).toBe('live-check-rid-123');
  });

  it('replaces an invalid incoming id with a generated one', () => {
    const resolved = resolveRequestId('<script>alert(1)</script>');
    expect(resolved).not.toBe('<script>alert(1)</script>');
    expect(isValidRequestId(resolved)).toBe(true);
    expect(isValidRequestId(resolveRequestId(undefined))).toBe(true);
  });
});
