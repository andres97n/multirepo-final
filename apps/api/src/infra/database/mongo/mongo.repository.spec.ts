import mongoose, { Schema, type Connection, type Model } from 'mongoose';
import { runRepositoryContract, type Widget } from '../core/testing/repository.contract';
import { MongoRepository, type MongoDocument } from './mongo.repository';
import { startMemoryMongo } from './testing/mongo-memory';

type WidgetDocument = MongoDocument<Widget>;

const WIDGET_FIELDS = ['id', 'sku', 'name', 'price', 'tags', 'active'] as const;

function createWidgetModel(connection: Connection): Model<WidgetDocument> {
  const schema = new Schema<WidgetDocument>({
    sku: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    tags: { type: [String], required: true },
    active: { type: Boolean, required: true },
  });
  return connection.model<WidgetDocument>('Widget', schema);
}

class WidgetRepository extends MongoRepository<Widget> {
  constructor(model: Model<WidgetDocument>) {
    super(model, WIDGET_FIELDS);
  }
}

runRepositoryContract('mongo', async () => {
  const { uri, stop } = await startMemoryMongo();
  const connection = await mongoose.createConnection(uri).asPromise();
  const model = createWidgetModel(connection);
  // Build the unique `sku` index before the suite runs (AC-M04.3).
  await model.syncIndexes();
  const repo = new WidgetRepository(model);
  return {
    repo,
    allowedFields: WIDGET_FIELDS,
    cleanup: async () => {
      await connection.close();
      await stop();
    },
  };
});
