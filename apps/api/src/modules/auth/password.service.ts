import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { argon2id, hash, needsRehash, verify, type HashOptions } from 'argon2';
import { APP_CONFIG } from '../../config/app-config';
import type { AuthConfig } from './auth.env';

/**
 * Argon2id password hashing with the parameters from the environment
 * (`ARGON2_*`). Deliberately NOT behind a port: it is a pure crypto helper,
 * identical on every engine (ports only where they pay off).
 */
@Injectable()
export class PasswordService implements OnModuleInit {
  private readonly options: HashOptions;
  /** Precomputed dummy hash for unknown-user timing equality (lazy, once). */
  private dummyHashPromise: Promise<string> | null = null;

  constructor(@Inject(APP_CONFIG) config: AuthConfig) {
    this.options = {
      type: argon2id,
      memoryCost: config.ARGON2_MEMORY_COST,
      timeCost: config.ARGON2_TIME_COST,
      parallelism: config.ARGON2_PARALLELISM,
    };
  }

  /** Hash a plaintext password with the configured Argon2id parameters. */
  /** Warm the dummy hash so the first unknown-email login costs the same as the rest. */
  async onModuleInit(): Promise<void> {
    await this.dummyHash();
  }

  hash(plain: string): Promise<string> {
    return hash(plain, this.options);
  }

  /** Verify against any digest; malformed digests are a failed verify, never a throw. */
  async verify(digest: string, plain: string): Promise<boolean> {
    try {
      return await verify(digest, plain);
    } catch {
      return false;
    }
  }

  /** True when `digest` was computed with parameters other than configured. */
  needsRehash(digest: string): boolean {
    try {
      return needsRehash(digest, this.options);
    } catch {
      // Unparseable digests cannot be trusted; treat them as stale.
      return true;
    }
  }

  /**
   * Verify `plain` against a precomputed dummy hash so a login attempt for an
   * unknown e-mail burns the same Argon2 work as a real verification
   * (AC-M06.10: unknown-email and wrong-password timing must be comparable).
   */
  async verifyDummy(plain: string): Promise<boolean> {
    // ponytail: computed once per process under the current ARGON2_* params;
    // a param change at deploy time only makes the first request slightly slower.
    return this.verify(await this.dummyHash(), plain);
  }

  private dummyHash(): Promise<string> {
    this.dummyHashPromise ??= this.hash('m06-dummy-timing-equalizer');
    return this.dummyHashPromise;
  }
}
