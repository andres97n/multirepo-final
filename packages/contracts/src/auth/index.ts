import { z } from 'zod';
import { filterSpec } from '../filters/index.js';
import { PageQuery, paginated } from '../pagination/index.js';

export const Role = z.enum(['user', 'admin']);

export type Role = z.infer<typeof Role>;

export const UserStatus = z.enum(['active', 'disabled']);

export type UserStatus = z.infer<typeof UserStatus>;

export const PASSWORD_POLICY = {
  minLength: 12,
  maxLength: 128,
} as const;

export const LoginInput = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof LoginInput>;

export const Password = z.string().min(PASSWORD_POLICY.minLength).max(PASSWORD_POLICY.maxLength);

export type Password = z.infer<typeof Password>;

export const MeResponse = z.object({
  id: z.string(),
  email: z.string(),
  roles: z.array(Role),
});

export type MeResponse = z.infer<typeof MeResponse>;

/** Login response: short-lived access JWT + opaque refresh token. */
export const TokenPair = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  /** Access-token lifetime in seconds. */
  expiresIn: z.number().int(),
});

export type TokenPair = z.infer<typeof TokenPair>;

export const RefreshInput = z.object({
  refreshToken: z.string().min(1),
});

export type RefreshInput = z.infer<typeof RefreshInput>;

/**
 * Admin user row. It deliberately never carries `passwordHash` or lockout
 * fields; Zod objects strip unknown keys, so extra DB fields can never leak.
 * `createdAt` is optional: neither engine's `User` entity carries creation
 * timestamps (the Mongo schema has no such field and the Postgres adapter
 * strips it in `mapRow`), so the listing endpoint may omit it.
 */
export const UserListItem = z.object({
  id: z.string(),
  email: z.string(),
  roles: z.array(Role),
  status: UserStatus,
  createdAt: z.iso.datetime().optional(),
});

export type UserListItem = z.infer<typeof UserListItem>;

/**
 * `GET /users` filter whitelist. `role` filters membership of the user's
 * `roles` array (translated to the engine's array semantics by the
 * repositories); `email` supports `contains`, all support `eq`.
 */
export const UsersFilter = filterSpec({
  allowedFields: ['email', 'role', 'status'],
  allowedOps: ['eq', 'contains'],
});

export type UsersFilter = z.infer<typeof UsersFilter>;

/** Query string of `GET /users`: pagination/sort plus the filter list. */
export const UsersQuery = PageQuery.extend({ filter: UsersFilter.default([]) });

export type UsersQuery = z.infer<typeof UsersQuery>;

/** Response body of `GET /users`. */
export const UsersPage = paginated(UserListItem);

export type UsersPage = z.infer<typeof UsersPage>;
