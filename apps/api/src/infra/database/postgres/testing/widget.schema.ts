import { boolean, doublePrecision, pgTable, text, unique } from 'drizzle-orm/pg-core';
import { baseColumns } from '../schema/columns';

/** Test-only table used by the repository contract suite (never migrated). */
export const widgets = pgTable(
  'widgets',
  {
    ...baseColumns,
    sku: text('sku').notNull(),
    name: text('name').notNull(),
    price: doublePrecision('price').notNull(),
    tags: text('tags').array().notNull(),
    active: boolean('active').notNull(),
  },
  (t) => [unique('widgets_sku_unique').on(t.sku)],
);
