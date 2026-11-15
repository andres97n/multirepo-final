import { z } from 'zod';

export const FilterOps = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'contains'] as const;

export function filterSpec<
  const F extends readonly string[],
  const O extends readonly string[],
>(options: { allowedFields: F; allowedOps: O }) {
  return z.array(
    z.object({
      field: z.enum(options.allowedFields),
      op: z.enum(options.allowedOps),
      value: z.union([
        z.string(),
        z.number(),
        z.boolean(),
        z.array(z.union([z.string(), z.number()])),
      ]),
    }),
  );
}
