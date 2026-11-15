import { z } from 'zod';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { PageQuery, paginated } from './index.js';

describe('PageQuery', () => {
  it('defaults page and limit, omitting sort', () => {
    expect(PageQuery.parse({})).toEqual({ page: 1, limit: 20 });
  });

  it('coerces numeric strings', () => {
    expect(PageQuery.parse({ page: '3', limit: '50' })).toEqual({ page: 3, limit: 50 });
  });

  it('rejects out-of-range and non-numeric values', () => {
    expect(() => PageQuery.parse({ limit: 101 })).toThrow();
    expect(() => PageQuery.parse({ limit: 0 })).toThrow();
    expect(() => PageQuery.parse({ page: 0 })).toThrow();
    expect(() => PageQuery.parse({ limit: 'abc' })).toThrow();
    expect(() => PageQuery.parse({ page: 'abc' })).toThrow();
  });

  it('accepts a valid sort and rejects an invalid one', () => {
    expect(PageQuery.parse({ sort: 'name:asc' })).toEqual({
      page: 1,
      limit: 20,
      sort: 'name:asc',
    });
    expect(PageQuery.parse({ sort: 'created_at.desc:desc' })).toEqual({
      page: 1,
      limit: 20,
      sort: 'created_at.desc:desc',
    });
    expect(() => PageQuery.parse({ sort: 'name:up' })).toThrow();
    expect(() => PageQuery.parse({ sort: '1name:asc' })).toThrow();
  });
});

describe('paginated', () => {
  it('builds a paginated response schema', () => {
    const item = z.object({ id: z.string() });
    const schema = paginated(item);

    expect(schema.parse({ items: [{ id: 'a' }], page: 1, limit: 20, total: 1 })).toEqual({
      items: [{ id: 'a' }],
      page: 1,
      limit: 20,
      total: 1,
    });
    expect(() => schema.parse({ items: [{ id: 'a' }], page: 0, limit: 20, total: 1 })).toThrow();
  });

  it('infers the item type', () => {
    const item = z.object({ id: z.string(), name: z.string() });
    const schema = paginated(item);
    type Paginated = z.infer<typeof schema>;

    expect(schema.parse({ items: [{ id: 'a', name: 'b' }], page: 1, limit: 20, total: 1 })).toEqual(
      {
        items: [{ id: 'a', name: 'b' }],
        page: 1,
        limit: 20,
        total: 1,
      },
    );
    expectTypeOf<Paginated['items']>().toEqualTypeOf<{ id: string; name: string }[]>();
    expectTypeOf<Paginated['page']>().toEqualTypeOf<number>();
    expectTypeOf<Paginated['total']>().toEqualTypeOf<number>();
  });
});
