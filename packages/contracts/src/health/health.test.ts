import { describe, expect, it } from 'vitest';
import { Health } from './index.js';

describe('Health', () => {
  it('accepts each status and check shape', () => {
    expect(Health.parse({ status: 'ok', checks: {} })).toEqual({ status: 'ok', checks: {} });
    expect(
      Health.parse({ status: 'degraded', checks: { db: { status: 'down', message: 'nope' } } }),
    ).toEqual({ status: 'degraded', checks: { db: { status: 'down', message: 'nope' } } });
  });

  it('rejects an unknown status', () => {
    expect(() => Health.parse({ status: 'up', checks: {} })).toThrow();
    expect(() => Health.parse({ status: 'ok', checks: { db: { status: 'up' } } })).toThrow();
  });
});
