import { runRepositoryContract, type Widget } from '../core/testing/repository.contract';
import { PostgresRepository } from './postgres.repository';
import type { PostgresDb } from './postgres.types';
import { startPglite, WIDGETS_DDL } from './testing/pglite';
import { widgets } from './testing/widget.schema';

const WIDGET_FIELDS = ['id', 'sku', 'name', 'price', 'tags', 'active'] as const;

class WidgetRepository extends PostgresRepository<Widget> {
  constructor(db: PostgresDb) {
    super(db, widgets, WIDGET_FIELDS);
  }
}

runRepositoryContract('postgres', async () => {
  const { db, stop } = await startPglite(WIDGETS_DDL);
  return { repo: new WidgetRepository(db), allowedFields: WIDGET_FIELDS, cleanup: stop };
});
