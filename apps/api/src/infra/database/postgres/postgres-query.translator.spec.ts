import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { InvalidQueryError } from '../core/errors';
import type { Filter } from '../core/query';
import { escapeLike, PostgresQueryTranslator } from './postgres-query.translator';
import { widgets } from './testing/widget.schema';

const FIELDS = ['id', 'sku', 'name', 'price', 'tags', 'active'];
const translator = new PostgresQueryTranslator(widgets, FIELDS);
const dialect = new PgDialect();

function render(filter: Filter) {
  const clause = translator.translateFilter(filter);
  return clause === undefined ? undefined : dialect.sqlToQuery(clause);
}

describe('PostgresQueryTranslator', () => {
  it('escapes LIKE wildcards so contains matches literally (AC-M05.6)', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');
    const query = render([{ field: 'name', op: 'contains', value: '100%_x' }]);
    expect(query?.params).toEqual(['%100\\%\\_x%']);
    expect(query?.sql).toContain('ilike');
  });

  it('binds values as parameters, never inlines them', () => {
    const query = render([{ field: 'sku', op: 'eq', value: "x'; drop table widgets;--" }]);
    expect(query?.sql).not.toContain('drop table');
    expect(query?.params).toEqual(["x'; drop table widgets;--"]);
  });

  it('returns no clause for an empty filter and a constant for an empty IN', () => {
    expect(translator.translateFilter([])).toBeUndefined();
    expect(render([{ field: 'price', op: 'in', value: [] }])?.sql).toContain('false');
  });

  it('coerces numeric/boolean strings from query strings', () => {
    expect(render([{ field: 'price', op: 'gt', value: '30' }])?.params).toEqual([30]);
    expect(render([{ field: 'active', op: 'eq', value: 'true' }])?.params).toEqual([true]);
  });

  it('rejects invalid values, fields, ops and shapes with InvalidQueryError', () => {
    const bad: Filter[] = [
      [{ field: 'price', op: 'gt', value: 'abc' }],
      [{ field: 'price', op: 'gt', value: '' }],
      [{ field: 'active', op: 'eq', value: 'maybe' }],
      [{ field: 'id', op: 'eq', value: 'not-a-uuid' }],
      [{ field: 'id', op: 'contains', value: 'abc' }],
      [{ field: 'price', op: 'contains', value: '1' }],
      [{ field: 'price', op: 'in', value: 5 }],
      [{ field: 'tags', op: 'eq', value: 'red' }],
      [{ field: 'tags', op: 'contains', value: 1 }],
      [{ field: 'nope', op: 'eq', value: 'x' }],
      [{ field: 'sku', op: 'like' as never, value: 'x' }],
    ];
    for (const filter of bad) {
      expect(() => translator.translateFilter(filter)).toThrow(InvalidQueryError);
    }
  });

  it('rejects fields whose column type is unsupported', () => {
    const dates = new PostgresQueryTranslator(widgets, ['createdAt']);
    expect(() => dates.translateFilter([{ field: 'createdAt', op: 'eq', value: 'x' }])).toThrow(
      InvalidQueryError,
    );
  });

  it('translates sorts with an id tiebreaker and rejects bad ones', () => {
    expect(translator.translateSort(undefined)).toHaveLength(1);
    expect(translator.translateSort('price:desc')).toHaveLength(2);
    expect(translator.translateSort('id:asc')).toHaveLength(1);
    for (const sort of ['price', 'price:up', 'nope:asc', ':asc']) {
      expect(() => translator.translateSort(sort)).toThrow(InvalidQueryError);
    }
  });
});

describe('PostgresQueryTranslator without id in the whitelist', () => {
  it('still sorts by id by default', () => {
    expect(new PostgresQueryTranslator(widgets, ['name']).translateSort(undefined)).toHaveLength(1);
  });
});
