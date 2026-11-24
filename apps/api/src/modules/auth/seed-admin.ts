import { NestFactory } from '@nestjs/core';
import { createInterface } from 'node:readline';
import { LoginInput, Password } from '@repo/contracts/auth';
import { AppModule } from '../../app.module';
import { ConflictError } from '../../infra/database/core/errors';
import { PasswordService } from './password.service';
import { UsersRepository } from './users.repository';

/** Outcome of one `seed:admin` attempt. */
export type SeedResult = 'created' | 'exists' | 'invalid-email' | 'invalid-password';

/** The human-readable line for each outcome (also the CLI's stdout/stderr text). */
const MESSAGES: Record<SeedResult, (email: string) => string> = {
  created: (email) => `seed:admin: created admin ${email}`,
  exists: (email) => `seed:admin: admin ${email} already exists; nothing changed`,
  'invalid-email': () => 'seed:admin: SEED_ADMIN_EMAIL is not a valid e-mail address',
  'invalid-password': () => 'seed:admin: SEED_ADMIN_PASSWORD violates the password policy',
};

/**
 * The idempotent core, separated from the CLI shell so it can be unit- and
 * e2e-tested against either engine. An existing user is never touched —
 * especially never re-hashed, so the second run cannot change a password.
 */
export async function seedAdmin(
  users: Pick<UsersRepository, 'findByEmail' | 'create'>,
  passwords: Pick<PasswordService, 'hash'>,
  email: string,
  password: string,
): Promise<SeedResult> {
  if (!LoginInput.shape.email.safeParse(email).success) {
    return 'invalid-email';
  }
  if (!Password.safeParse(password).success) {
    return 'invalid-password';
  }
  const normalized = email.trim().toLowerCase();
  if ((await users.findByEmail(normalized)) !== null) {
    return 'exists';
  }
  try {
    await users.create({
      email: normalized,
      passwordHash: await passwords.hash(password),
      roles: ['admin'],
      status: 'active',
      failedLoginCount: 0,
      lockedUntil: null,
    });
    return 'created';
  } catch (error) {
    // Lost the (admittedly theoretical) concurrent-seed race: still idempotent.
    if (error instanceof ConflictError && error.field === 'email') {
      return 'exists';
    }
    throw error;
  }
}

/**
 * Credential resolution for the CLI: env first (`SEED_ADMIN_EMAIL` /
 * `SEED_ADMIN_PASSWORD`), then interactive prompts when stdin is a TTY; a
 * clear failure otherwise (never a silent empty seed). `prompt` is injected so
 * tests never touch a real terminal.
 */
export async function resolveCredentials(
  env: NodeJS.ProcessEnv,
  isTty: boolean | undefined,
  prompt: (question: string) => Promise<string>,
): Promise<{ email: string; password: string } | null> {
  const email =
    env['SEED_ADMIN_EMAIL'] ?? (isTty === true ? await prompt('Admin email: ') : undefined);
  const password =
    env['SEED_ADMIN_PASSWORD'] ?? (isTty === true ? await prompt('Admin password: ') : undefined);
  if (email === undefined || password === undefined) {
    return null;
  }
  return { email, password };
}

/** Minimal port of the Nest application context the seeding needs. */
interface SeedContext {
  get(token: unknown): unknown;
  close(): Promise<void>;
}

/**
 * Structural "is wired" check for the users port. `instanceof UsersRepository`
 * cannot be used: the engine adapters `implement` the abstract-class port
 * (they already extend their engine base class), so instances carry no
 * `UsersRepository` prototype — the DI token is the only link.
 */
function isUsersRepository(value: unknown): value is UsersRepository {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<Pick<UsersRepository, 'findByEmail' | 'create'>>;
  return typeof candidate.findByEmail === 'function' && typeof candidate.create === 'function';
}

/**
 * Everything `run` needs, injected so it is unit-testable without booting a
 * real Nest app, database or terminal. The default wiring below is the only
 * place `NestFactory`/`process` are touched.
 */
export interface SeedDeps {
  env: NodeJS.ProcessEnv;
  isTty: boolean | undefined;
  prompt: (question: string) => Promise<string>;
  createContext: () => Promise<SeedContext>;
  write: (line: string) => void;
  writeError: (line: string) => void;
  exit: (code: number) => void;
}

/** The CLI orchestration, free of module-scope side effects (testable). */
export async function runSeed(deps: SeedDeps): Promise<void> {
  const credentials = await resolveCredentials(deps.env, deps.isTty, deps.prompt);
  if (credentials === null) {
    deps.writeError(
      'seed:admin: set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD, or run interactively (TTY stdin).\n',
    );
    deps.exit(1);
    return;
  }
  const app = await deps.createContext();
  try {
    const usersValue = app.get(UsersRepository);
    if (!isUsersRepository(usersValue)) {
      throw new Error('seed:admin: UsersRepository is not wired (is @module:auth active?)');
    }
    const passwordsValue = app.get(PasswordService);
    if (!(passwordsValue instanceof PasswordService)) {
      throw new Error('seed:admin: PasswordService is not wired');
    }
    const result = await seedAdmin(
      usersValue,
      passwordsValue,
      credentials.email,
      credentials.password,
    );
    const message = `${MESSAGES[result](credentials.email)}\n`;
    if (result === 'invalid-email' || result === 'invalid-password') {
      deps.writeError(message);
      deps.exit(1);
      return;
    }
    deps.write(message);
  } finally {
    await app.close();
  }
}

/**
 * Read one line from the terminal. Streams are injectable (default: stdio)
 * so the prompt round-trip is unit-testable without a real TTY.
 */
export function ask(
  question: string,
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
): Promise<string> {
  const rl = createInterface({ input, output });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

const PRODUCTION_DEPS: SeedDeps = {
  env: process.env,
  isTty: process.stdin.isTTY,
  prompt: ask,
  createContext: async () => NestFactory.createApplicationContext(AppModule, { logger: false }),
  write: (line) => process.stdout.write(line),
  writeError: (line) => process.stderr.write(line),
  exit: (code) => process.exit(code),
};

// Only the CLI entry executes; specs import the pure core above.
if (process.argv[1] !== undefined && process.argv[1].includes('seed-admin')) {
  runSeed(PRODUCTION_DEPS)
    .then(() => process.exit(0))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`seed:admin failed: ${message}\n`);
      process.exit(1);
    });
}
