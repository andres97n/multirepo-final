import { afterEach, describe, expect, it, vi } from 'vitest';
import { RevocationCache } from './revocation.cache';
import { authTestConfig } from './testing/spec-config';

afterEach(() => {
  vi.useRealTimers();
});

describe('RevocationCache (AC-M06.4)', () => {
  it('caches verdicts and expires them after the TTL', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-22T12:00:00.000Z'));
    const cache = new RevocationCache(authTestConfig({ AUTH_REVOCATION_CACHE_TTL_SECONDS: 15 }));
    expect(cache.get('sid-1')).toBeUndefined();
    cache.set('sid-1', false);
    expect(cache.get('sid-1')).toBe(false);
    vi.advanceTimersByTime(14_000);
    expect(cache.get('sid-1')).toBe(false);
    vi.advanceTimersByTime(2_000); // past the 15 s TTL
    expect(cache.get('sid-1')).toBeUndefined();
  });

  it('sweeps expired entries on write so one-off sids do not accumulate', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-22T12:00:00.000Z'));
    const cache = new RevocationCache(authTestConfig({ AUTH_REVOCATION_CACHE_TTL_SECONDS: 15 }));
    for (let i = 0; i < 50; i++) {
      cache.set(`sid-${String(i)}`, false);
    }
    vi.advanceTimersByTime(16_000);
    cache.set('fresh', false);
    const entries = (cache as unknown as { entries: Map<string, unknown> }).entries;
    expect([...entries.keys()]).toEqual(['fresh']);
  });

  it('stores revoked verdicts too (they are re-checked after the TTL, never wrong)', () => {
    const cache = new RevocationCache(authTestConfig({ AUTH_REVOCATION_CACHE_TTL_SECONDS: 15 }));
    cache.set('sid-2', true);
    expect(cache.get('sid-2')).toBe(true);
  });

  it('disables caching entirely when the TTL is 0', () => {
    const cache = new RevocationCache(authTestConfig({ AUTH_REVOCATION_CACHE_TTL_SECONDS: 0 }));
    cache.set('sid-3', false);
    expect(cache.get('sid-3')).toBeUndefined();
  });

  it('invalidate and clear drop entries immediately', () => {
    const cache = new RevocationCache(authTestConfig({ AUTH_REVOCATION_CACHE_TTL_SECONDS: 15 }));
    cache.set('sid-4', false);
    cache.invalidate('sid-4');
    expect(cache.get('sid-4')).toBeUndefined();
    cache.set('sid-5', false);
    cache.clear();
    expect(cache.get('sid-5')).toBeUndefined();
  });
});
