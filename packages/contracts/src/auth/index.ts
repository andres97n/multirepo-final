import { z } from 'zod';

export const Role = z.enum(['user', 'admin']);

export type Role = z.infer<typeof Role>;

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
