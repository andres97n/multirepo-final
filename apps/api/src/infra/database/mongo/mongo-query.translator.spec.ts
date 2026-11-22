import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { InvalidQueryError } from '../core/errors';
import type { Filter, FilterItem } from '../core/query';
import { MongoQueryTranslator } from './mongo-query.translator';

const FIELDS = ['id', 'sku', 'name', 'price', 'tags', 'active'] as const;

const translator = new MongoQueryTranslator(FIELDS);

/** Strips the `mongoose.trusted` marker so assertions compare plain data. */
function plain(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function translate(filter: Filter): Record<string, unknown> {
  return plain(translator.translateFilter(filter)) as Record<string, unknown>;
}

function item(field: string, op: FilterItem['op'], value: FilterItem['value']): FilterItem {
  return { field, op, value };
}

describe('MongoQueryTranslator.translateFilter', () => {
  it('maps every operator to its fixed Mongo shape', () => {
    expect(translate([item('sku', 'eq', 'A')])).toEqual({ sku: { $eq: 'A' } });
    expect(translate([item('sku', 'ne', 'A')])).toEqual({ sku: { $ne: 'A' } });
    expect(translate([item('price', 'gt', 1)])).toEqual({ price: { $gt: 1 } });
    expect(translate([item('price', 'gte', 1)])).toEqual({ price: { $gte: 1 } });
    expect(translate([item('price', 'lt', 1)])).toEqual({ price: { $lt: 1 } });
    expect(translate([item('price', 'lte', 1)])).toEqual({ price: { $lte: 1 } });
    expect(translate([item('price', 'in', [1, 2])])).toEqual({ price: { $in: [1, 2] } });
    expect(translate([item('name', 'contains', 'a.b')])).toEqual({
      name: { $regex: 'a\\.b', $options: 'i' },
    });
  });

  it('merges multiple items on the same field under one object', () => {
    expect(
      translate([item('price', 'gte', 1), item('price', 'lte', 5), item('active', 'eq', true)]),
    ).toEqual({ price: { $gte: 1, $lte: 5 }, active: { $eq: true } });
  });

  it('escapes every regex metacharacter in contains values', () => {
    const result = translate([item('name', 'contains', '.*+?^${}()|[]\\')]);
    const clause = result.name as { $regex?: string; $options?: string };
    expect(clause.$options).toBe('i');
    expect(clause.$regex).toBe('\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');
  });

  it('never emits $where, $expr or user-supplied $ keys', () => {
    const result = translate([item('name', 'eq', 'x')]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('$where');
    expect(serialized).not.toContain('$expr');
    expect(Object.keys(result).every((key) => !key.startsWith('$'))).toBe(true);
  });

  it('rejects non-whitelisted fields, including $-keys and dotted paths', () => {
    expect(() => translate([item('$where', 'eq', 'x')])).toThrow(InvalidQueryError);
    expect(() => translate([item('a.b', 'eq', 'x')])).toThrow(InvalidQueryError);
    expect(() => translate([item('secret', 'eq', 'x')])).toThrow(InvalidQueryError);
  });

  it('rejects unknown operators', () => {
    expect(() => translate([{ field: 'sku', op: 'regex' as never, value: 'x' }])).toThrow(
      InvalidQueryError,
    );
  });

  it('rejects non-scalar values for range ops and bad values for in/contains', () => {
    expect(() => translate([item('price', 'gt', { $gt: '' } as never)])).toThrow(InvalidQueryError);
    expect(() => translate([item('price', 'lte', [1])])).toThrow(InvalidQueryError);
    expect(() => translate([item('price', 'in', 1)])).toThrow(InvalidQueryError);
    expect(() => translate([item('name', 'contains', 1)])).toThrow(InvalidQueryError);
  });

  it('rejects object values for eq/ne so operators never reach the driver (AC-M04.6)', () => {
    expect(() => translate([item('sku', 'eq', { $gt: '' } as never)])).toThrow(InvalidQueryError);
    expect(() => translate([item('sku', 'ne', { $gt: '' } as never)])).toThrow(InvalidQueryError);
  });

  it('casts id values to ObjectId with a strict round-trip check', () => {
    const hex = '507f1f77bcf86cd799439011';
    const clause = translator.translateFilter([item('id', 'eq', hex)])._id as { $eq?: unknown };
    expect(clause.$eq).toBeInstanceOf(Types.ObjectId);
    expect(String(clause.$eq)).toBe(hex);

    const inClause = translator.translateFilter([item('id', 'in', [hex, hex])])._id as {
      $in?: unknown[];
    };
    expect(inClause.$in).toHaveLength(2);
    expect(inClause.$in?.[0]).toBeInstanceOf(Types.ObjectId);

    expect(() => translate([item('id', 'eq', 'not-an-id')])).toThrow(InvalidQueryError);
    expect(() => translate([item('id', 'eq', 123)])).toThrow(InvalidQueryError);
    expect(() => translate([item('id', 'in', ['zzzzzzzzzzzzzzzzzzzzzzzz'])])).toThrow(
      InvalidQueryError,
    );
  });
});

describe('MongoQueryTranslator.translateSort', () => {
  it('defaults to ascending _id for a stable order', () => {
    expect(translator.translateSort(undefined)).toEqual({ _id: 1 });
  });

  it('adds _id as tiebreaker after the requested field', () => {
    expect(translator.translateSort('price:asc')).toEqual({ price: 1, _id: 1 });
    expect(translator.translateSort('price:desc')).toEqual({ price: -1, _id: 1 });
  });

  it('maps id sorts directly to _id without a duplicate key', () => {
    expect(translator.translateSort('id:asc')).toEqual({ _id: 1 });
    expect(translator.translateSort('id:desc')).toEqual({ _id: -1 });
  });

  it('rejects malformed sorts and non-whitelisted fields (AC-M04.8)', () => {
    expect(() => translator.translateSort('price')).toThrow(InvalidQueryError);
    expect(() => translator.translateSort('price:sideways')).toThrow(InvalidQueryError);
    expect(() => translator.translateSort('secret:asc')).toThrow(InvalidQueryError);
    expect(() => translator.translateSort('$where:asc')).toThrow(InvalidQueryError);
  });
});
