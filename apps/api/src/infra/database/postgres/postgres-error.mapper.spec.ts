import { describe, expect, it } from 'vitest';
import {
  ConflictError,
  DbError,
  DbUnavailableError,
  InvalidQueryError,
  NotFoundError,
} from '../core/errors';
import { mapPostgresError } from './postgres-error.mapper';

const FIELDS = new Map([['unit_price', 'unitPrice']]);
const map = (error: unknown) => mapPostgresError(error, 'widgets', FIELDS);

describe('mapPostgresError', () => {
  it('maps 23505 to ConflictError with the field parsed from <table>_<column>_unique', () => {
    const error = map({ code: '23505', constraint: 'widgets_sku_unique' });
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).field).toBe('sku');
  });

  it('maps the column back to the property name', () => {
    const error = map({ code: '23505', constraint: 'widgets_unit_price_unique' });
    expect((error as ConflictError).field).toBe('unitPrice');
  });

  it('leaves the field undefined when the constraint breaks the naming convention', () => {
    for (const constraint of ['widgets_pkey', 'other_sku_unique', undefined]) {
      const error = map({ code: '23505', constraint });
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).field).toBeUndefined();
    }
  });

  it('reads the SQLSTATE from a wrapped driver error (.cause)', () => {
    const error = map(
      Object.assign(new Error('Failed query'), {
        cause: { code: '23505', constraint: 'widgets_sku_unique' },
      }),
    );
    expect((error as ConflictError).field).toBe('sku');
  });

  it('maps foreign key violations to ConflictError', () => {
    expect(map({ code: '23503' })).toBeInstanceOf(ConflictError);
  });

  it('maps connection failures to DbUnavailableError', () => {
    for (const input of [
      { code: '08006' },
      { code: '57P01' },
      { code: 'ECONNREFUSED' },
      new Error('timeout exceeded when trying to connect'),
    ]) {
      expect(map(input)).toBeInstanceOf(DbUnavailableError);
    }
  });

  it('maps bad client data to InvalidQueryError', () => {
    for (const code of ['22P02', '22003', '23502', '23514']) {
      expect(map({ code })).toBeInstanceOf(InvalidQueryError);
    }
  });

  it('passes DbErrors and unknown errors through untouched', () => {
    const known = new NotFoundError();
    expect(map(known)).toBe(known);
    expect(known).toBeInstanceOf(DbError);
    const unknown = new Error('boom');
    expect(map(unknown)).toBe(unknown);
    expect(map('text')).toBe('text');
  });
});
