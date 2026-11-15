import { z } from 'zod';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { ErrorEnvelope, successEnvelope } from './index.js';

describe('successEnvelope', () => {
  it('wraps a schema as data with an optional meta record', () => {
    const user = z.object({ id: z.string() });
    const envelope = successEnvelope(user);

    expect(envelope.parse({ data: { id: 'a' } })).toEqual({ data: { id: 'a' } });
    expect(envelope.parse({ data: { id: 'a' }, meta: { trace: 'x' } })).toEqual({
      data: { id: 'a' },
      meta: { trace: 'x' },
    });
  });

  it('infers the wrapped data type', () => {
    const user = z.object({ id: z.string(), name: z.string() });
    const envelope = successEnvelope(user);
    type Envelope = z.infer<typeof envelope>;

    expect(envelope.parse({ data: { id: 'a', name: 'b' } })).toEqual({
      data: { id: 'a', name: 'b' },
    });
    expectTypeOf<Envelope['data']>().toEqualTypeOf<{ id: string; name: string }>();
  });
});

describe('ErrorEnvelope', () => {
  it('requires a non-empty requestId', () => {
    expect(() => ErrorEnvelope.parse({ error: { code: 'NOT_FOUND', message: 'nope' } })).toThrow();
    expect(() =>
      ErrorEnvelope.parse({ error: { code: 'NOT_FOUND', message: 'nope', requestId: '' } }),
    ).toThrow();
  });

  it('parses a valid error envelope with optional details', () => {
    const value = {
      error: { code: 'NOT_FOUND', message: 'nope', requestId: 'req-1', details: { id: 1 } },
    };
    expect(ErrorEnvelope.parse(value)).toEqual(value);
  });
});
