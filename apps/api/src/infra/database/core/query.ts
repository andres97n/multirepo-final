import type { FilterOps } from '@repo/contracts';

export type FilterOp = (typeof FilterOps)[number];
export type FilterValue = string | number | boolean | Array<string | number>;

export interface FilterItem {
  field: string;
  op: FilterOp;
  value: FilterValue;
}

export type Filter = readonly FilterItem[];

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

export interface QueryTranslator<Q = unknown, S = unknown> {
  /** Throws InvalidQueryError for non-whitelisted fields/ops or bad values. */
  translateFilter(filter: Filter): Q;
  /** `sort` is the PageQuery string `field:asc|desc`; undefined -> adapter default (stable). */
  translateSort(sort: string | undefined): S;
}
