import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../../config/app-config';
import type { AuthConfig } from './auth.env';

/**
 * ponytail: per-process revocation cache — a second instance keeps its own
 * copy, so revocation propagates after at most the TTL; move to Redis when
 * the API scales horizontally (documented in ADR-0006).
 */
@Injectable()
export class RevocationCache {
  private readonly ttlMs: number;
  /** sid -> "revoked?" verdict plus the moment the cached answer expires. */
  private readonly entries = new Map<string, { revoked: boolean; expiresAtMs: number }>();

  constructor(@Inject(APP_CONFIG) config: AuthConfig) {
    this.ttlMs = config.AUTH_REVOCATION_CACHE_TTL_SECONDS * 1000;
  }

  /** True: revoked. False: valid. Undefined: miss (or caching disabled). */
  get(sid: string): boolean | undefined {
    if (this.ttlMs === 0) {
      return undefined;
    }
    const entry = this.entries.get(sid);
    if (entry === undefined) {
      return undefined;
    }
    if (entry.expiresAtMs <= Date.now()) {
      this.entries.delete(sid);
      return undefined;
    }
    // A cached answer can only be stale toward revoked (revoked sessions
    // never become valid again), and only within the TTL window (AC-M06.4).
    return entry.revoked;
  }

  set(sid: string, revoked: boolean): void {
    if (this.ttlMs > 0) {
      this.sweep();
      this.entries.delete(sid); // re-insert at the tail to keep TTL order
      this.entries.set(sid, { revoked, expiresAtMs: Date.now() + this.ttlMs });
    }
  }

  /** Drop one entry (logout/revoke keeps the local instance immediately correct). */
  /**
   * Drops expired entries so one-off sids cannot accumulate. Map iterates in
   * insertion order and every entry has the same TTL, so the oldest come first.
   */
  private sweep(): void {
    const now = Date.now();
    for (const [sid, entry] of this.entries) {
      if (entry.expiresAtMs > now) {
        break;
      }
      this.entries.delete(sid);
    }
  }

  invalidate(sid: string): void {
    this.entries.delete(sid);
  }

  clear(): void {
    this.entries.clear();
  }
}
