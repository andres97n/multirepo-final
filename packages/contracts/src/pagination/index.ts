import { z } from 'zod';

const sortPattern = /^[A-Za-z_][A-Za-z0-9_.]*:(asc|desc)$/;

export const PageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().regex(sortPattern).optional(),
});

export type PageQuery = z.infer<typeof PageQuery>;

export function paginated<T extends z.ZodType>(schema: T) {
  return z.object({
    items: z.array(schema),
    page: z.number().int().min(1),
    limit: z.number().int().min(1).max(100),
    total: z.number().int().min(0),
  });
}
