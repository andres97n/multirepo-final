import { describe, expect, it } from 'vitest';
import { FilterOps, filterSpec } from './index.js';

describe('FilterOps', () => {
  it('lists the supported operators', () => {
    expect(FilterOps).toEqual(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'contains']);
  });
});

describe('filterSpec', () => {
  const spec = filterSpec({ allowedFields: ['name', 'age'], allowedOps: ['eq', 'in'] });

  it('accepts valid filters for every value type', () => {
    expect(spec.parse([{ field: 'name', op: 'eq', value: 'x' }])).toEqual([
      { field: 'name', op: 'eq', value: 'x' },
    ]);
    expect(spec.parse([{ field: 'age', op: 'eq', value: 3 }])).toEqual([
      { field: 'age', op: 'eq', value: 3 },
    ]);
    expect(spec.parse([{ field: 'age', op: 'eq', value: true }])).toEqual([
      { field: 'age', op: 'eq', value: true },
    ]);
    expect(spec.parse([{ field: 'name', op: 'in', value: ['a', 'b'] }])).toEqual([
      { field: 'name', op: 'in', value: ['a', 'b'] },
    ]);
    expect(spec.parse([{ field: 'age', op: 'in', value: [1, 2] }])).toEqual([
      { field: 'age', op: 'in', value: [1, 2] },
    ]);
  });

  it('rejects an unknown field', () => {
    expect(() => spec.parse([{ field: 'bogus', op: 'eq', value: 'x' }])).toThrow();
  });

  it('rejects an unknown operator', () => {
    expect(() => spec.parse([{ field: 'name', op: 'contains', value: 'x' }])).toThrow();
  });

  it('rejects every operator when allowedOps is empty', () => {
    const emptyOps = filterSpec({ allowedFields: ['name'], allowedOps: [] });
    expect(() => emptyOps.parse([{ field: 'name', op: 'eq', value: 'x' }])).toThrow();
  });
});
