-- Dev-only provisioning, run once by the postgres image on first start.
-- The app connects as `app`: a plain login role (no superuser/createdb/createrole),
-- owner of nothing but allowed to create tables in `public` so `db:migrate` works.
-- In production use a separate migration role and a least-privilege runtime role.
CREATE ROLE app LOGIN PASSWORD 'app' NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT CONNECT, CREATE ON DATABASE app TO app; -- CREATE: drizzle-kit keeps its journal in schema `drizzle`
GRANT ALL ON SCHEMA public TO app;
