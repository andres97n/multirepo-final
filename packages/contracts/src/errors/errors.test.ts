import { describe, expect, it } from 'vitest';
import { ErrorCode, ErrorCodes } from './index.js';

describe('ErrorCode', () => {
  it.each([
    'VALIDATION_FAILED',
    'UNAUTHORIZED',
    'FORBIDDEN',
    'NOT_FOUND',
    'CONFLICT',
    'RATE_LIMITED',
    'INTERNAL',
  ])('accepts %s', (code) => {
    expect(ErrorCode.parse(code)).toBe(code);
  });

  it('rejects unknown codes', () => {
    expect(() => ErrorCode.parse('UNKNOWN')).toThrow();
  });
});

describe('ErrorCodes', () => {
  it('exposes every ErrorCode value', () => {
    expect(ErrorCodes).toEqual({
      VALIDATION_FAILED: 'VALIDATION_FAILED',
      UNAUTHORIZED: 'UNAUTHORIZED',
      FORBIDDEN: 'FORBIDDEN',
      NOT_FOUND: 'NOT_FOUND',
      CONFLICT: 'CONFLICT',
      RATE_LIMITED: 'RATE_LIMITED',
      INTERNAL: 'INTERNAL',
    });
  });
});
