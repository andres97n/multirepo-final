import { z } from 'zod';

export const Health = z.object({
  status: z.enum(['ok', 'degraded', 'down']),
  checks: z.record(
    z.string(),
    z.object({
      status: z.enum(['ok', 'degraded', 'down']),
      message: z.string().optional(),
    }),
  ),
});

export type Health = z.infer<typeof Health>;
