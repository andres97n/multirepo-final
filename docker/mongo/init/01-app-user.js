// Dev/prod-like provisioning, run once by the mongo image on first start (mongosh).
// Creates the least-privilege `app` user the api connects as (readWrite on db `app` only).
/* global db, process -- mongosh init script, run by the mongo image */
if (!process.env.MONGO_APP_PASSWORD) {
  throw new Error('MONGO_APP_PASSWORD is required');
}
db.getSiblingDB('app').createUser({
  user: 'app',
  pwd: process.env.MONGO_APP_PASSWORD,
  roles: [{ role: 'readWrite', db: 'app' }],
});
