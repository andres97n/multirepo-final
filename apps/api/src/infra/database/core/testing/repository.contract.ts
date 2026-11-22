import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ConflictError, InvalidQueryError, NotFoundError } from '../errors';
import type { Filter, FilterOp, FilterValue } from '../query';
import type { Repository } from '../repository';

/**
 * Sample entity used only by the contract suite (never shipped in `src`
 * production code). Every future adapter must pass this suite unchanged
 * (AC-M04.1, FR-3.3).
 */
export interface Widget {
  id: string;
  sku: string;
  name: string;
  price: number;
  tags: string[];
  active: boolean;
}

export interface RepositoryContractResult {
  repo: Repository<Widget>;
  allowedFields: readonly string[];
  cleanup: () => Promise<void>;
}

function widget(overrides: Partial<Omit<Widget, 'id'>> = {}): Omit<Widget, 'id'> {
  return { sku: 'SKU-1', name: 'Widget', price: 10, tags: ['a'], active: true, ...overrides };
}

function filter(field: string, op: FilterOp, value: FilterValue): Filter {
  return [{ field, op, value }];
}

function skus(items: Widget[]): string[] {
  return items.map((item) => item.sku);
}

/** Wipes all documents through the port itself (no adapter-specific APIs). */
async function wipe(repo: Repository<Widget>): Promise<void> {
  for (;;) {
    const page = await repo.findMany({ page: 1, limit: 100 });
    if (page.items.length === 0) {
      return;
    }
    for (const item of page.items) {
      await repo.delete(item.id);
    }
  }
}

const FIXTURE: Array<Omit<Widget, 'id'>> = [
  { sku: 'F-0', name: 'Alpha', price: 10, tags: ['red'], active: true },
  { sku: 'F-1', name: 'Bravo', price: 20, tags: ['blue'], active: false },
  { sku: 'F-2', name: 'Charlie', price: 30, tags: ['red', 'blue'], active: true },
  { sku: 'F-3', name: 'Delta', price: 40, tags: [], active: false },
  { sku: 'F-4', name: 'Echo', price: 50, tags: ['red'], active: true },
];

async function createFixture(repo: Repository<Widget>): Promise<void> {
  for (const item of FIXTURE) {
    await repo.create(item);
  }
}

/**
 * The reusable repository contract. `factory` boots the adapter under test and
 * returns the port, its field whitelist and a cleanup callback.
 */
export function runRepositoryContract(
  name: string,
  factory: () => Promise<RepositoryContractResult>,
): void {
  describe(`repository contract: ${name} (AC-M04.1)`, () => {
    let ctx: RepositoryContractResult;

    beforeAll(async () => {
      ctx = await factory();
    });

    afterAll(async () => {
      await ctx.cleanup();
    });

    beforeEach(async () => {
      await wipe(ctx.repo);
    });

    it('returns the whitelisted fields the suite relies on', () => {
      for (const field of ['id', 'sku', 'name', 'price', 'tags', 'active']) {
        expect(ctx.allowedFields).toContain(field);
      }
    });

    it('creates and reads back by id (string id, no _id/__v)', async () => {
      const created = await ctx.repo.create(widget());
      expect(typeof created.id).toBe('string');
      expect(created.id.length).toBeGreaterThan(0);
      expect(created).not.toHaveProperty('_id');
      expect(created).not.toHaveProperty('__v');

      const found = await ctx.repo.findById(created.id);
      expect(found).toEqual(created);
      expect(found).not.toHaveProperty('_id');
      expect(found).not.toHaveProperty('__v');
    });

    it('finds one document by filter and returns null on a miss', async () => {
      const created = await ctx.repo.create(widget({ sku: 'ONE-1' }));
      const hit = await ctx.repo.findOne(filter('sku', 'eq', 'ONE-1'));
      expect(hit?.id).toBe(created.id);
      expect(hit).not.toHaveProperty('_id');

      const miss = await ctx.repo.findOne(filter('sku', 'eq', 'NOPE'));
      expect(miss).toBeNull();
    });

    it('updates a document and leaves other fields untouched', async () => {
      const created = await ctx.repo.create(widget());
      const updated = await ctx.repo.update(created.id, { price: 99 });
      expect(updated.price).toBe(99);
      expect(updated.sku).toBe(created.sku);
      expect(updated.name).toBe(created.name);
      expect(updated.tags).toEqual(created.tags);
      expect(updated.active).toBe(created.active);
      expect(updated.id).toBe(created.id);

      const persisted = await ctx.repo.findById(created.id);
      expect(persisted.price).toBe(99);
    });

    it('deletes a document so findById then throws NotFoundError', async () => {
      const created = await ctx.repo.create(widget());
      await ctx.repo.delete(created.id);
      await expect(ctx.repo.findById(created.id)).rejects.toBeInstanceOf(NotFoundError);
      expect(await ctx.repo.exists(created.id)).toBe(false);
    });

    it('exists() is true for present ids and false for missing or malformed ones', async () => {
      const created = await ctx.repo.create(widget());
      expect(await ctx.repo.exists(created.id)).toBe(true);

      await ctx.repo.delete(created.id);
      expect(await ctx.repo.exists(created.id)).toBe(false);
      expect(await ctx.repo.exists('not-an-id')).toBe(false);
    });

    it('treats malformed ids as NotFoundError for findById/update/delete', async () => {
      await expect(ctx.repo.findById('not-an-id')).rejects.toBeInstanceOf(NotFoundError);
      await expect(ctx.repo.update('not-an-id', { price: 1 })).rejects.toBeInstanceOf(
        NotFoundError,
      );
      await expect(ctx.repo.delete('not-an-id')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('treats a well-formed but missing id as NotFoundError (never a 500)', async () => {
      const missing = 'aaaaaaaaaaaaaaaaaaaaaaaa';
      await expect(ctx.repo.findById(missing)).rejects.toBeInstanceOf(NotFoundError);
      await expect(ctx.repo.update(missing, { price: 1 })).rejects.toBeInstanceOf(NotFoundError);
      await expect(ctx.repo.delete(missing)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('maps a duplicate unique key to ConflictError with the field name', async () => {
      await ctx.repo.create(widget({ sku: 'DUP-1' }));
      const error = await ctx.repo.create(widget({ sku: 'DUP-1' })).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).field).toBe('sku');
    });

    it('paginates with correct totals, echoed limit and stable order', async () => {
      for (let i = 0; i < 25; i++) {
        await ctx.repo.create(widget({ sku: `P-${String(i).padStart(3, '0')}`, price: i }));
      }

      const first = await ctx.repo.findMany({ page: 1, limit: 10 });
      expect(first.items).toHaveLength(10);
      expect(first.page).toBe(1);
      expect(first.limit).toBe(10);
      expect(first.total).toBe(25);

      const second = await ctx.repo.findMany({ page: 2, limit: 10 });
      expect(second.items).toHaveLength(10);
      expect(second.total).toBe(25);

      const last = await ctx.repo.findMany({ page: 3, limit: 10 });
      expect(last.items).toHaveLength(5);
      expect(last.total).toBe(25);
      expect(last.limit).toBe(10);

      const beyond = await ctx.repo.findMany({ page: 4, limit: 10 });
      expect(beyond.items).toHaveLength(0);
      expect(beyond.total).toBe(25);

      // Pages neither overlap nor skip documents, and repeat runs are stable.
      const ids = [...first.items, ...second.items].map((item) => item.id);
      expect(new Set(ids).size).toBe(20);

      const all = await ctx.repo.findMany({ page: 1, limit: 100 });
      expect(all.items.slice(0, 10).map((item) => item.id)).toEqual(
        first.items.map((item) => item.id),
      );
      expect(all.items.slice(10, 20).map((item) => item.id)).toEqual(
        second.items.map((item) => item.id),
      );

      const firstAgain = await ctx.repo.findMany({ page: 1, limit: 10 });
      expect(firstAgain.items.map((item) => item.id)).toEqual(first.items.map((item) => item.id));
    });

    it('sorts ascending, descending and defaults to creation order', async () => {
      const prices = [30, 10, 50, 20, 40];
      for (const [index, price] of prices.entries()) {
        await ctx.repo.create(widget({ sku: `S-${String(index)}`, price }));
      }

      const asc = await ctx.repo.findMany({ page: 1, limit: 100, sort: 'price:asc' });
      expect(asc.items.map((item) => item.price)).toEqual([10, 20, 30, 40, 50]);

      const desc = await ctx.repo.findMany({ page: 1, limit: 100, sort: 'price:desc' });
      expect(desc.items.map((item) => item.price)).toEqual([50, 40, 30, 20, 10]);

      const defaultOrder = await ctx.repo.findMany({ page: 1, limit: 100 });
      expect(skus(defaultOrder.items)).toEqual(['S-0', 'S-1', 'S-2', 'S-3', 'S-4']);
    });

    it('supports every filter operator', async () => {
      await createFixture(ctx.repo);

      const eq = await ctx.repo.findMany({ page: 1, limit: 100 }, filter('price', 'eq', 30));
      expect(skus(eq.items)).toEqual(['F-2']);
      expect(eq.total).toBe(1);

      const ne = await ctx.repo.findMany({ page: 1, limit: 100 }, filter('price', 'ne', 30));
      expect(skus(ne.items)).toEqual(['F-0', 'F-1', 'F-3', 'F-4']);
      expect(ne.total).toBe(4);

      const gt = await ctx.repo.findMany({ page: 1, limit: 100 }, filter('price', 'gt', 30));
      expect(skus(gt.items)).toEqual(['F-3', 'F-4']);
      expect(gt.total).toBe(2);

      const gte = await ctx.repo.findMany({ page: 1, limit: 100 }, filter('price', 'gte', 30));
      expect(skus(gte.items)).toEqual(['F-2', 'F-3', 'F-4']);
      expect(gte.total).toBe(3);

      const lt = await ctx.repo.findMany({ page: 1, limit: 100 }, filter('price', 'lt', 30));
      expect(skus(lt.items)).toEqual(['F-0', 'F-1']);
      expect(lt.total).toBe(2);

      const lte = await ctx.repo.findMany({ page: 1, limit: 100 }, filter('price', 'lte', 30));
      expect(skus(lte.items)).toEqual(['F-0', 'F-1', 'F-2']);
      expect(lte.total).toBe(3);

      const inValues = await ctx.repo.findMany(
        { page: 1, limit: 100 },
        filter('price', 'in', [10, 50]),
      );
      expect(skus(inValues.items)).toEqual(['F-0', 'F-4']);
      expect(inValues.total).toBe(2);

      const contains = await ctx.repo.findMany(
        { page: 1, limit: 100 },
        filter('name', 'contains', 'ta'),
      );
      expect(skus(contains.items)).toEqual(['F-3']);
      expect(contains.total).toBe(1);

      const containsCaseInsensitive = await ctx.repo.findMany(
        { page: 1, limit: 100 },
        filter('name', 'contains', 'ALPHA'),
      );
      expect(skus(containsCaseInsensitive.items)).toEqual(['F-0']);

      const containsArray = await ctx.repo.findMany(
        { page: 1, limit: 100 },
        filter('tags', 'contains', 'red'),
      );
      expect(skus(containsArray.items)).toEqual(['F-0', 'F-2', 'F-4']);
      expect(containsArray.total).toBe(3);
    });

    it('combines filters (across and within fields) with correct totals', async () => {
      await createFixture(ctx.repo);

      const combined = await ctx.repo.findMany({ page: 1, limit: 100 }, [
        { field: 'price', op: 'gte', value: 20 },
        { field: 'active', op: 'eq', value: true },
      ]);
      expect(skus(combined.items)).toEqual(['F-2', 'F-4']);
      expect(combined.total).toBe(2);

      const merged = await ctx.repo.findMany({ page: 1, limit: 100 }, [
        { field: 'price', op: 'gte', value: 20 },
        { field: 'price', op: 'lte', value: 40 },
      ]);
      expect(skus(merged.items)).toEqual(['F-1', 'F-2', 'F-3']);
      expect(merged.total).toBe(3);
    });

    it('rejects non-whitelisted fields, sorts and unknown operators (AC-M04.8)', async () => {
      await expect(
        ctx.repo.findMany({ page: 1, limit: 10 }, filter('secret_field', 'eq', 'x')),
      ).rejects.toBeInstanceOf(InvalidQueryError);
      await expect(
        ctx.repo.findMany({ page: 1, limit: 10, sort: 'secret_field:asc' }),
      ).rejects.toBeInstanceOf(InvalidQueryError);
      await expect(
        ctx.repo.findMany({ page: 1, limit: 10 }, [
          { field: 'sku', op: 'like', value: 'x' },
        ] as unknown as Filter),
      ).rejects.toBeInstanceOf(InvalidQueryError);
      await expect(ctx.repo.findOne(filter('secret_field', 'eq', 'x'))).rejects.toBeInstanceOf(
        InvalidQueryError,
      );
    });

    it('escapes regex metacharacters in contains (AC-M04.7)', async () => {
      const names = ['a.*b', 'aab', 'xaaby', '(a+)+', 'aaaa', 'x[a]y'];
      for (const [index, name] of names.entries()) {
        await ctx.repo.create(widget({ sku: `R-${String(index)}`, name }));
      }

      const wildcard = await ctx.repo.findMany(
        { page: 1, limit: 100 },
        filter('name', 'contains', 'a.*b'),
      );
      expect(skus(wildcard.items)).toEqual(['R-0']);

      const parens = await ctx.repo.findMany(
        { page: 1, limit: 100 },
        filter('name', 'contains', '(a+)+'),
      );
      expect(skus(parens.items)).toEqual(['R-3']);

      const brackets = await ctx.repo.findMany(
        { page: 1, limit: 100 },
        filter('name', 'contains', '[a]'),
      );
      expect(skus(brackets.items)).toEqual(['R-5']);
    });

    it('rejects object-valued eq/ne instead of treating them as operators (AC-M04.6)', async () => {
      await ctx.repo.create(widget({ sku: 'O-1', price: 5 }));
      const operatorObject = { $gt: '' } as unknown as FilterValue;

      await expect(
        ctx.repo.findMany({ page: 1, limit: 10 }, filter('price', 'eq', operatorObject)),
      ).rejects.toBeInstanceOf(InvalidQueryError);
      await expect(
        ctx.repo.findMany({ page: 1, limit: 10 }, filter('name', 'ne', operatorObject)),
      ).rejects.toBeInstanceOf(InvalidQueryError);
    });

    it('rejects values that do not fit the field type with InvalidQueryError, not a driver error', async () => {
      await expect(
        ctx.repo.findMany({ page: 1, limit: 10 }, filter('price', 'gt', 'abc')),
      ).rejects.toBeInstanceOf(InvalidQueryError);
      await expect(
        ctx.repo.findMany({ page: 1, limit: 10 }, filter('active', 'eq', 'maybe')),
      ).rejects.toBeInstanceOf(InvalidQueryError);
    });

    it('rejects caller-supplied identity and operator keys on create/update', async () => {
      const created = await ctx.repo.create(widget({ sku: 'W-1' }));

      await expect(
        ctx.repo.create({ ...widget({ sku: 'W-2' }), id: 'x' } as never),
      ).rejects.toBeInstanceOf(InvalidQueryError);
      await expect(ctx.repo.update(created.id, { _id: 'x' } as never)).rejects.toBeInstanceOf(
        InvalidQueryError,
      );
      await expect(
        ctx.repo.update(created.id, { $set: { price: 1 } } as never),
      ).rejects.toBeInstanceOf(InvalidQueryError);
    });
  });
}
