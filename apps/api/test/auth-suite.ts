import type { NestExpressApplication } from '@nestjs/platform-express';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { LoginInput, MeResponse, TokenPair, UsersPage } from '@repo/contracts/auth';
import { IS_PUBLIC_KEY } from '../src/common/public.decorator';
import { PasswordService } from '../src/modules/auth/password.service';
import { SessionsRepository } from '../src/modules/auth/sessions.repository';
import { UsersRepository } from '../src/modules/auth/users.repository';
import { seedAdmin } from '../src/modules/auth/seed-admin';
import type { AuthClock } from '../src/modules/auth/auth.clock';
import { AuthController } from '../src/modules/auth/auth.controller';
import { HealthController } from '../src/infra/health/health.controller';
import { UsersController } from '../src/modules/auth/users.controller';
import { asErrorEnvelope, withEnv } from './helpers';

/**
 * The auth e2e suite, shared verbatim by the two engines (AC-M06.16):
 * `auth.e2e-spec.ts` runs it on the wired Mongo adapter and
 * `auth-postgres.e2e-spec.ts` runs it with the Postgres adapters bound to
 * PGlite through `overrideProvider` — identical HTTP assertions, ports only,
 * zero driver imports (eslint-enforced), no marker changes. Time is
 * controlled through the injected `AUTH_CLOCK`, never fake timers, so
 * supertest sockets stay untouched.
 */

export interface TestClock extends AuthClock {
  set(date: Date): void;
  advanceMs(ms: number): void;
}

export function createTestClock(start: Date = new Date()): TestClock {
  const state = { current: start.getTime() };
  return {
    now: () => new Date(state.current),
    set: (date: Date) => {
      state.current = date.getTime();
    },
    advanceMs: (ms: number) => {
      state.current += ms;
    },
  };
}

export interface AuthSuiteContext {
  app: NestExpressApplication;
  users: UsersRepository;
  sessions: SessionsRepository;
  passwords: PasswordService;
  clock: TestClock;
  close(): Promise<void>;
}

export type AuthSuiteFactory = () => Promise<AuthSuiteContext>;

const JWT_SECRET = 'e2e-auth-access-token-secret-0123456789abcdef';

function baseEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    JWT_ACCESS_SECRET: JWT_SECRET,
    // Deterministic, small-cost argon2 keeps the suite fast (still argon2id).
    ARGON2_MEMORY_COST: '64',
    ARGON2_TIME_COST: '1',
    ARGON2_PARALLELISM: '1',
    AUTH_REVOCATION_CACHE_TTL_SECONDS: '0',
    REFRESH_GRACE_SECONDS: '0',
    THROTTLE_TTL_MS: '60000',
    THROTTLE_LIMIT: '10000',
    LOGIN_THROTTLE_TTL_MS: '60000',
    LOGIN_THROTTLE_LIMIT: '10000',
    SESSION_CLEANUP_INTERVAL_MINUTES: '60',
    ...overrides,
  };
}

const PASSWORD = 'e2e-sup3r-secret-pw';
let emailSeq = 0;
function nextEmail(prefix = 'user'): string {
  emailSeq += 1;
  return `${prefix}-${String(process.pid)}-${String(emailSeq)}@example.com`;
}

function bearer(token: string): string {
  return `Bearer ${token}`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

async function login(
  ctx: AuthSuiteContext,
  email: string,
  password = PASSWORD,
): Promise<request.Response> {
  const body: LoginInput = { email, password };
  return request(ctx.app.getHttpServer()).post('/api/v1/auth/login').send(body);
}

async function refreshWith(ctx: AuthSuiteContext, refreshToken: string): Promise<request.Response> {
  return request(ctx.app.getHttpServer()).post('/api/v1/auth/refresh').send({ refreshToken });
}

async function meWith(ctx: AuthSuiteContext, accessToken: string): Promise<request.Response> {
  return request(ctx.app.getHttpServer())
    .get('/api/v1/auth/me')
    .set('Authorization', bearer(accessToken));
}

async function createUser(
  ctx: AuthSuiteContext,
  email: string,
  overrides: Partial<Pick<Awaited<ReturnType<UsersRepository['create']>>, 'roles' | 'status'>> = {},
): Promise<void> {
  await ctx.users.create({
    email,
    passwordHash: await ctx.passwords.hash(PASSWORD),
    roles: ['user'],
    status: 'active',
    failedLoginCount: 0,
    lockedUntil: null,
    ...overrides,
  });
}

/** Craft raw HS256 JWTs for the negative cases (AC-M06.13). */
function craftToken(
  payloadOverrides: Record<string, unknown>,
  options: { secret?: string } = {},
): string {
  const jwt = new JwtService();
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      sub: 'user-x',
      roles: ['user'],
      sid: 'session-x',
      iss: 'multirepo-api',
      aud: 'multirepo-web',
      iat: now,
      exp: now + 900,
      ...payloadOverrides,
    },
    { algorithm: 'HS256', secret: options.secret ?? JWT_SECRET },
  );
}

function craftAlgNone(payloadOverrides: Record<string, unknown>): string {
  const encode = (value: unknown): string =>
    Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const head = encode({ alg: 'none', typ: 'JWT' });
  const body = encode({
    sub: 'user-x',
    roles: ['user'],
    sid: 'session-x',
    iss: 'multirepo-api',
    aud: 'multirepo-web',
    iat: now,
    exp: now + 900,
    ...payloadOverrides,
  });
  return `${head}.${body}.`;
}

/**
 * Serialize the contract filter list as `filter[i][field]=...` query pairs.
 * supertest's `.query(object)` drops the array indices (`filter[field]=`), so
 * the bracketed list syntax the `UsersQuery` contract defines is built here.
 */
function usersQs(params: {
  page?: number;
  limit?: number;
  filter?: Array<{ field: string; op: string; value: string }>;
}): string {
  const parts: string[] = [];
  if (params.page !== undefined) {
    parts.push(`page=${String(params.page)}`);
  }
  if (params.limit !== undefined) {
    parts.push(`limit=${String(params.limit)}`);
  }
  (params.filter ?? []).forEach((item, index) => {
    parts.push(`filter[${String(index)}][field]=${encodeURIComponent(item.field)}`);
    parts.push(`filter[${String(index)}][op]=${encodeURIComponent(item.op)}`);
    parts.push(`filter[${String(index)}][value]=${encodeURIComponent(item.value)}`);
  });
  return parts.length === 0 ? '' : `?${parts.join('&')}`;
}

async function withContext<T>(
  factory: AuthSuiteFactory,
  overrides: Record<string, string>,
  fn: (ctx: AuthSuiteContext) => Promise<T>,
): Promise<T> {
  return withEnv(baseEnv(overrides), async () => {
    const ctx = await factory();
    try {
      return await fn(ctx);
    } finally {
      await ctx.close();
    }
  });
}

const DAY = 86_400_000;

export function runAuthE2eSuite(name: string, factory: AuthSuiteFactory): void {
  describe(`auth e2e [${name}] (AC-M06.1–M06.14)`, () => {
    it('valid credentials -> 200 TokenPair; me -> MeResponse with no secret fields (AC-M06.1)', async () => {
      await withContext(factory, {}, async (ctx) => {
        const email = nextEmail();
        await createUser(ctx, email);
        const res = await login(ctx, email);
        expect(res.status).toBe(200);
        const pair = TokenPair.parse(res.body);
        expect(pair.expiresIn).toBe(900);

        const me = await meWith(ctx, pair.accessToken);
        expect(me.status).toBe(200);
        const parsed = MeResponse.parse(me.body);
        expect(parsed.email).toBe(email);
        expect(parsed.roles).toEqual(['user']);
        const rawBody: unknown = me.body;
        expect(Object.keys(rawBody as object).sort()).toEqual(['email', 'id', 'roles']);
        expect(JSON.stringify(me.body)).not.toContain('passwordHash');
        expect(JSON.stringify(me.body)).not.toContain('lockedUntil');
        expect(JSON.stringify(me.body)).not.toContain(pair.refreshToken);

        const anon = await request(ctx.app.getHttpServer()).get('/api/v1/auth/me');
        expect(anon.status).toBe(401);
      });
    });

    it('unknown email and wrong password are identical; disabled users too (AC-M06.10)', async () => {
      await withContext(factory, {}, async (ctx) => {
        const email = nextEmail();
        await createUser(ctx, email);
        const disabledEmail = nextEmail('disabled');
        await createUser(ctx, disabledEmail, { status: 'disabled' });

        const unknown = await login(ctx, nextEmail('ghost'));
        const wrong = await login(ctx, email, 'wrong-password-entirely');
        const disabled = await login(ctx, disabledEmail);
        expect(unknown.status).toBe(401);
        expect(wrong.status).toBe(401);
        expect(disabled.status).toBe(401);
        // AC-M06.10: identical status, body and code (requestId excepted:
        // every response carries its own).
        const shape = (
          res: request.Response,
        ): { status: number; code: string; message: string } => ({
          status: res.status,
          code: asErrorEnvelope(res.body).error.code,
          message: asErrorEnvelope(res.body).error.message,
        });
        expect(shape(wrong)).toEqual(shape(unknown));
        expect(shape(disabled)).toEqual(shape(unknown));
        expect(asErrorEnvelope(unknown.body).error.code).toBe('UNAUTHORIZED');
      });
    });

    it('refresh rotates the pair and the old refresh token stops working (AC-M06.2)', async () => {
      await withContext(factory, {}, async (ctx) => {
        const email = nextEmail();
        await createUser(ctx, email);
        const first = TokenPair.parse((await login(ctx, email)).body);
        const rotated = await refreshWith(ctx, first.refreshToken);
        expect(rotated.status).toBe(200);
        const second = TokenPair.parse(rotated.body);
        expect(second.refreshToken).not.toBe(first.refreshToken);
        expect(sha256(second.refreshToken)).not.toBe(sha256(first.refreshToken));

        const replay = await refreshWith(ctx, first.refreshToken);
        expect(replay.status).toBe(401);
      });
    });

    it('reusing a rotated refresh token revokes the whole family (AC-M06.3)', async () => {
      await withContext(factory, {}, async (ctx) => {
        const email = nextEmail();
        await createUser(ctx, email);
        const first = TokenPair.parse((await login(ctx, email)).body);
        const second = TokenPair.parse((await refreshWith(ctx, first.refreshToken)).body);

        const replay = await refreshWith(ctx, first.refreshToken);
        expect(replay.status).toBe(401);

        // A subsequent refresh with the newest token also returns 401.
        const after = await refreshWith(ctx, second.refreshToken);
        expect(after.status).toBe(401);

        // The whole family is revoked at the store level.
        const dead = await ctx.sessions.findByTokenHash(sha256(second.refreshToken));
        expect(dead?.revokedAt).not.toBeNull();
      });
    });

    it('replay inside the grace window returns a fresh pair without revoking', async () => {
      await withContext(factory, { REFRESH_GRACE_SECONDS: '10' }, async (ctx) => {
        const email = nextEmail();
        await createUser(ctx, email);
        const first = TokenPair.parse((await login(ctx, email)).body);
        const rotated = await refreshWith(ctx, first.refreshToken);
        expect(rotated.status).toBe(200);

        // Tab B replays tab A's token moments later: grace wins, nothing dies.
        const replay = await refreshWith(ctx, first.refreshToken);
        expect(replay.status).toBe(200);
        const replayed = TokenPair.parse(replay.body);

        const next = await refreshWith(ctx, replayed.refreshToken);
        expect(next.status).toBe(200);

        const head = await ctx.sessions.findByTokenHash(
          sha256(TokenPair.parse(next.body).refreshToken),
        );
        expect(head?.revokedAt).toBeNull();
      });
    });

    it('logout revokes; the revoked sid is rejected within the cache TTL (AC-M06.4)', async () => {
      await withContext(factory, {}, async (ctx) => {
        const email = nextEmail();
        await createUser(ctx, email);
        const pair = TokenPair.parse((await login(ctx, email)).body);
        expect((await meWith(ctx, pair.accessToken)).status).toBe(200);

        const out = await request(ctx.app.getHttpServer())
          .post('/api/v1/auth/logout')
          .set('Authorization', bearer(pair.accessToken));
        expect(out.status).toBe(204);

        // Cache disabled (TTL 0): the very next request sees the revocation.
        const after = await meWith(ctx, pair.accessToken);
        expect(after.status).toBe(401);
        expect(asErrorEnvelope(after.body).error.code).toBe('UNAUTHORIZED');
        const refresh = await refreshWith(ctx, pair.refreshToken);
        expect(refresh.status).toBe(401);
      });
    });

    it('sliding refresh extends expiry but never past the family cap (AC-M06.5)', async () => {
      const t0 = new Date('2027-03-01T00:00:00.000Z');
      await withContext(
        factory,
        { REFRESH_IDLE_TTL_DAYS: '10', REFRESH_FAMILY_TTL_DAYS: '12' },
        async (ctx) => {
          ctx.clock.set(t0);
          const email = nextEmail();
          await createUser(ctx, email);
          const first = TokenPair.parse((await login(ctx, email)).body);
          const session1 = await ctx.sessions.findByTokenHash(sha256(first.refreshToken));
          expect(session1).not.toBeNull();
          if (session1 === null) {
            throw new Error('session missing after login');
          }

          ctx.clock.set(new Date(t0.getTime() + 9 * DAY));
          const second = TokenPair.parse((await refreshWith(ctx, first.refreshToken)).body);
          const session2 = await ctx.sessions.findByTokenHash(sha256(second.refreshToken));
          expect(session2?.id).toBe(session1.id);
          // min(now + 10d, cap) == the cap: the slide is clamped.
          expect(session2?.expiresAt.getTime()).toBe(t0.getTime() + 12 * DAY);
          expect(session2?.familyExpiresAt.getTime()).toBe(t0.getTime() + 12 * DAY);

          ctx.clock.set(new Date(t0.getTime() + 12 * DAY + 60_000));
          const expired = await refreshWith(ctx, second.refreshToken);
          expect(expired.status).toBe(401);
        },
      );
    });

    it('two logins create independent families (AC-M06.6)', async () => {
      await withContext(factory, {}, async (ctx) => {
        const email = nextEmail();
        await createUser(ctx, email);
        const a = TokenPair.parse((await login(ctx, email)).body);
        const b = TokenPair.parse((await login(ctx, email)).body);
        expect(a.refreshToken).not.toBe(b.refreshToken);

        await request(ctx.app.getHttpServer())
          .post('/api/v1/auth/logout')
          .set('Authorization', bearer(a.accessToken));

        expect((await meWith(ctx, a.accessToken)).status).toBe(401);
        expect((await refreshWith(ctx, a.refreshToken)).status).toBe(401);
        expect((await meWith(ctx, b.accessToken)).status).toBe(200);
        expect((await refreshWith(ctx, b.refreshToken)).status).toBe(200);
      });
    });

    it('GET /users: admin 200 with filters, plain user 403, no token 401 (AC-M06.7)', async () => {
      await withContext(factory, {}, async (ctx) => {
        const crowd = `z${String(process.pid)}${String(emailSeq)}`;
        const adminEmail = nextEmail(`admin-${crowd}`);
        const userEmail = nextEmail(`plain-${crowd}`);
        await createUser(ctx, adminEmail, { roles: ['admin'] });
        await createUser(ctx, userEmail);

        const anon = await request(ctx.app.getHttpServer()).get('/api/v1/users');
        expect(anon.status).toBe(401);

        const userPair = TokenPair.parse((await login(ctx, userEmail)).body);
        const forbidden = await request(ctx.app.getHttpServer())
          .get('/api/v1/users')
          .set('Authorization', bearer(userPair.accessToken));
        expect(forbidden.status).toBe(403);
        expect(asErrorEnvelope(forbidden.body).error.code).toBe('FORBIDDEN');

        const adminPair = TokenPair.parse((await login(ctx, adminEmail)).body);
        const all = await request(ctx.app.getHttpServer())
          .get(`/api/v1/users${usersQs({ page: 1, limit: 100 })}`)
          .set('Authorization', bearer(adminPair.accessToken));
        expect(all.status, JSON.stringify(all.body)).toBe(200);
        const page = UsersPage.parse(all.body);
        expect(page.total).toBeGreaterThanOrEqual(2);

        const byEmail = await request(ctx.app.getHttpServer())
          .get(
            `/api/v1/users${usersQs({ filter: [{ field: 'email', op: 'contains', value: crowd }] })}`,
          )
          .set('Authorization', bearer(adminPair.accessToken));
        expect(byEmail.status, JSON.stringify(byEmail.body)).toBe(200);
        const filtered = UsersPage.parse(byEmail.body);
        expect(filtered.total).toBe(2);
        expect(filtered.items.map((item) => item.email).sort()).toEqual(
          [adminEmail, userEmail].sort(),
        );

        const byRole = await request(ctx.app.getHttpServer())
          .get(`/api/v1/users${usersQs({ filter: [{ field: 'role', op: 'eq', value: 'admin' }] })}`)
          .set('Authorization', bearer(adminPair.accessToken));
        expect(byRole.status, JSON.stringify(byRole.body)).toBe(200);
        const rolePage = UsersPage.parse(byRole.body);
        expect(rolePage.items.some((item) => item.email === adminEmail)).toBe(true);
        expect(rolePage.items.every((item) => item.roles.includes('admin'))).toBe(true);

        const byStatus = await request(ctx.app.getHttpServer())
          .get(
            `/api/v1/users${usersQs({ filter: [{ field: 'status', op: 'eq', value: 'active' }] })}`,
          )
          .set('Authorization', bearer(adminPair.accessToken));
        expect(byStatus.status, JSON.stringify(byStatus.body)).toBe(200);
        expect(UsersPage.parse(byStatus.body).items.length).toBeGreaterThan(0);

        const badFilter = await request(ctx.app.getHttpServer())
          .get(
            `/api/v1/users${usersQs({ filter: [{ field: 'passwordHash', op: 'eq', value: 'x' }] })}`,
          )
          .set('Authorization', bearer(adminPair.accessToken));
        expect(badFilter.status).toBe(400);
      });
    });

    it('seed:admin is idempotent and never rewrites the password (AC-M06.8)', async () => {
      await withContext(factory, {}, async (ctx) => {
        const email = nextEmail('seeded');
        await expect(seedAdmin(ctx.users, ctx.passwords, email, PASSWORD)).resolves.toBe('created');
        await expect(
          seedAdmin(ctx.users, ctx.passwords, email, 'different-password-123'),
        ).resolves.toBe('exists');
        const row = await ctx.users.findByEmail(email.toLowerCase());
        expect(row?.roles).toEqual(['admin']);
        expect(row?.status).toBe('active');
        // The original password still signs in: the second run changed nothing.
        expect((await login(ctx, email)).status).toBe(200);
        expect((await login(ctx, email, 'different-password-123')).status).toBe(401);
      });
    });

    it('progressive lockout ladder; a success resets (AC-M06.9)', async () => {
      const t0 = new Date('2027-04-01T00:00:00.000Z');
      await withContext(factory, {}, async (ctx) => {
        ctx.clock.set(t0);
        const email = nextEmail();
        await createUser(ctx, email);
        const wrong = 'wrong-password-entirely';

        for (let attempt = 1; attempt <= 5; attempt++) {
          expect((await login(ctx, email, wrong)).status).toBe(401);
        }
        const locked = await ctx.users.findByEmail(email);
        expect(locked?.failedLoginCount).toBe(5);
        expect(locked?.lockedUntil?.getTime()).toBe(t0.getTime() + 60_000);

        // Locked: even the RIGHT password is 401 until the window passes.
        ctx.clock.set(new Date(t0.getTime() + 59_000));
        expect((await login(ctx, email)).status).toBe(401);

        // After 60 s the account unlocks; a fresh failure now locks for 120 s.
        const t1 = new Date(t0.getTime() + 61_000);
        ctx.clock.set(t1);
        expect((await login(ctx, email, wrong)).status).toBe(401);
        const second = await ctx.users.findByEmail(email);
        expect(second?.failedLoginCount).toBe(6);
        expect(second?.lockedUntil?.getTime()).toBe(t1.getTime() + 120_000);

        // ... then 240 s.
        const t2 = new Date(t1.getTime() + 121_000);
        ctx.clock.set(t2);
        expect((await login(ctx, email, wrong)).status).toBe(401);
        const third = await ctx.users.findByEmail(email);
        expect(third?.lockedUntil?.getTime()).toBe(t2.getTime() + 240_000);

        // ... doubling until the 900 s cap (failures 8, 9, 10).
        const t3 = new Date(t2.getTime() + 241_000);
        ctx.clock.set(t3);
        await login(ctx, email, wrong); // failure 8 -> 480 s
        const t4 = new Date(t3.getTime() + 481_000);
        ctx.clock.set(t4);
        await login(ctx, email, wrong); // failure 9 -> 900 s (capped from 960)
        const capped = await ctx.users.findByEmail(email);
        expect(capped?.failedLoginCount).toBe(9);
        expect(capped?.lockedUntil?.getTime()).toBe(t4.getTime() + 900_000);

        // A success resets the counter and the lock.
        ctx.clock.set(new Date(t4.getTime() + 901_000));
        expect((await login(ctx, email)).status).toBe(200);
        const reset = await ctx.users.findByEmail(email);
        expect(reset?.failedLoginCount).toBe(0);
        expect(reset?.lockedUntil).toBeNull();
      });
    });

    it('argon2id hashes and sha256-hex refresh hashes in the store (AC-M06.12)', async () => {
      await withContext(factory, {}, async (ctx) => {
        const email = nextEmail();
        await createUser(ctx, email);
        const pair = TokenPair.parse((await login(ctx, email)).body);
        const row = await ctx.users.findByEmail(email);
        expect(String(row?.passwordHash).startsWith('$argon2id$')).toBe(true);
        expect(row?.passwordHash).not.toContain(PASSWORD);

        const session = await ctx.sessions.findByTokenHash(sha256(pair.refreshToken));
        expect(session).not.toBeNull();
        expect(session?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
        expect(session?.tokenHash).not.toBe(pair.refreshToken);
        expect(JSON.stringify(session)).not.toContain(pair.refreshToken);
      });
    });

    it('JWTs with wrong iss/aud, alg none, expired or bad signature are rejected (AC-M06.13)', async () => {
      await withContext(factory, {}, async (ctx) => {
        const email = nextEmail();
        await createUser(ctx, email);
        const pair = TokenPair.parse((await login(ctx, email)).body);
        // The valid token works, so rejections below come from the token itself.
        expect((await meWith(ctx, pair.accessToken)).status).toBe(200);

        const now = Math.floor(Date.now() / 1000);
        const cases: Array<{ label: string; token: string }> = [
          { label: 'wrong issuer', token: craftToken({ iss: 'evil-issuer' }) },
          { label: 'wrong audience', token: craftToken({ aud: 'evil-audience' }) },
          { label: 'alg none', token: craftAlgNone({}) },
          {
            label: 'bad signature',
            token: craftToken({}, { secret: 'attacker-key-0123456789-abcdef-attacker' }),
          },
          {
            label: 'expired',
            token: craftToken({ iat: now - 3600, exp: now - 900 }),
          },
        ];
        for (const testCase of cases) {
          const res = await request(ctx.app.getHttpServer())
            .get('/api/v1/auth/me')
            .set('Authorization', bearer(testCase.token));
          expect(res.status, testCase.label).toBe(401);
        }
      });
    });

    it('per-IP login throttle -> 429 after the limit, independent of account (AC-M06.11)', async () => {
      await withContext(
        factory,
        { LOGIN_THROTTLE_LIMIT: '3', LOGIN_THROTTLE_TTL_MS: '60000' },
        async (ctx) => {
          const emailA = nextEmail('throttle-a');
          const emailB = nextEmail('throttle-b');
          await createUser(ctx, emailA);
          await createUser(ctx, emailB);
          expect((await login(ctx, emailA)).status).toBe(200);
          expect((await login(ctx, emailB)).status).toBe(200);
          expect((await login(ctx, emailA)).status).toBe(200);
          // The fourth attempt is blocked for ANY account from this IP.
          const blocked = await login(ctx, emailB);
          expect(blocked.status).toBe(429);
          expect(asErrorEnvelope(blocked.body).error.code).toBe('RATE_LIMITED');

          // The login throttler leaves other routes alone: still answerable.
          const users = await request(ctx.app.getHttpServer()).get('/api/v1/users');
          expect(users.status).toBe(401);
          const health = await request(ctx.app.getHttpServer()).get('/api/v1/health/live');
          expect(health.status).toBe(200);
        },
      );
    });

    it('every endpoint is protected by default; only marked routes skip auth (AC-M06.14)', async () => {
      await withContext(factory, {}, async (ctx) => {
        const publicRoutes = new Set([
          '/api/v1/health/live',
          '/api/v1/health/ready',
          '/api/v1/auth/login',
          '/api/v1/auth/refresh',
        ]);
        const verbFor: Partial<Record<RequestMethod, 'get' | 'post'>> = {
          [RequestMethod.GET]: 'get',
          [RequestMethod.POST]: 'post',
        };
        const controllers = [HealthController, AuthController, UsersController];
        const seen: string[] = [];
        const agent = request(ctx.app.getHttpServer());
        for (const controller of controllers) {
          const base = Reflect.getMetadata(PATH_METADATA, controller) as string;
          const classPublic = Reflect.getMetadata(IS_PUBLIC_KEY, controller) === true;
          for (const key of Object.getOwnPropertyNames(controller.prototype)) {
            if (key === 'constructor') {
              continue;
            }
            const method: unknown = Reflect.get(controller.prototype, key);
            if (typeof method !== 'function') {
              continue;
            }
            const verb = Reflect.getMetadata(METHOD_METADATA, method) as RequestMethod | undefined;
            const httpVerb = verb === undefined ? undefined : verbFor[verb];
            if (httpVerb === undefined) {
              continue;
            }
            const suffix = (Reflect.getMetadata(PATH_METADATA, method) as string | undefined) ?? '';
            const clean = (value: string): string => value.replace(/^\/+|\/+$/g, '');
            const url = `/${['api', 'v1', clean(base), clean(suffix)]
              .filter((part) => part.length > 0)
              .join('/')}`;
            seen.push(url);
            const isPublic = classPublic || Reflect.getMetadata(IS_PUBLIC_KEY, method) === true;
            const res = await agent[httpVerb](url);
            if (isPublic) {
              expect(publicRoutes.has(url), `${url} is public but unlisted`).toBe(true);
              expect(res.status, `${url} must skip auth`).not.toBe(401);
            } else {
              expect(res.status, `${url} must require auth`).toBe(401);
              expect(asErrorEnvelope(res.body).error.code).toBe('UNAUTHORIZED');
            }
          }
        }
        // The real surface: 2 health + 4 auth + 1 users.
        expect(seen.sort()).toEqual([
          '/api/v1/auth/login',
          '/api/v1/auth/logout',
          '/api/v1/auth/me',
          '/api/v1/auth/refresh',
          '/api/v1/health/live',
          '/api/v1/health/ready',
          '/api/v1/users',
        ]);
      });
    });

    it('OpenAPI docs are served raw and are not guarded (AC-M06.14 docs carve-out)', async () => {
      await withContext(factory, {}, async (ctx) => {
        const spec = await request(ctx.app.getHttpServer()).get('/api/docs-json');
        expect(spec.status).toBe(200);
      });
    });
  });
}
