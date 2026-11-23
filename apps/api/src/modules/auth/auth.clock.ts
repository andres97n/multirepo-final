/**
 * Injectable clock. Everything time-dependent in `AuthService` (lockout
 * checks, session expiry, rotation) reads time through it, so e2e tests can
 * move time without touching the fake-timers machinery around supertest
 * sockets (`overrideProvider(AUTH_CLOCK)`).
 */
export interface AuthClock {
  now(): Date;
}

export const AUTH_CLOCK = Symbol('AUTH_CLOCK');

export const systemClock: AuthClock = { now: () => new Date() };
