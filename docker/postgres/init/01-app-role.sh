#!/bin/sh
# Dev-only provisioning, run once by the postgres image on first start.
# The app connects as `app`: a plain login role (no superuser/createdb/createrole),
# owner of nothing but allowed to create tables in `public` so `db:migrate` works.
# In production use a separate migration role and a least-privilege runtime role.
set -eu
: "${APP_DB_PASSWORD:?APP_DB_PASSWORD is required}"
psql -v ON_ERROR_STOP=1 -v app_password="$APP_DB_PASSWORD" --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
CREATE ROLE app LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT CONNECT, CREATE ON DATABASE app TO app; -- CREATE: drizzle-kit keeps its journal in schema `drizzle`
GRANT ALL ON SCHEMA public TO app;
SQL
