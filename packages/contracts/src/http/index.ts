import { z } from 'zod';
import { ErrorCode } from '../errors/index.js';

export function successEnvelope<T extends z.ZodType>(schema: T) {
  return z.object({
    data: schema,
    meta: z.record(z.string(), z.unknown()).optional(),
  });
}

export const ErrorEnvelope = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string().min(1),
  }),
});

export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>;
