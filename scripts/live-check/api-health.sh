#!/usr/bin/env bash
# Live check: apps/api boots and reports health against a REAL database in Docker.
# Usage (repo root): bash scripts/live-check/api-health.sh <mongo|postgres>
# Needs Docker running. Hard timeout 480s, always tears down (see lib.sh). Exit 1 if any check fails.
#   postgres: app role is not superuser (AC-M05.8), db:migrate twice is a no-op and db:generate finds
#             no changes (AC-M05.3), engine swap touches only marker regions (AC-M05.10), API boots,
#             /health/ready is 200 up, 503 down and recovers (AC-M05.4/5).
#   mongo:    API boots, /health/ready is 200 up, 503 down and recovers (M04).
ENGINE=${1:-}
case "$ENGINE" in
  mongo | postgres) ;;
  *) echo "usage: api-health.sh <mongo|postgres>"; exit 2 ;;
esac
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
lc_init "api-health-$ENGINE"

FLIPPED=(apps/api/src/app.module.ts apps/api/src/config/env.schema.ts apps/api/src/modules/auth/auth.module.ts)
[ -z "$(git status --short -- "${FLIPPED[@]}")" ] || { echo "ABORT: marker files have local changes"; exit 1; }

psqlc() { $COMPOSE exec -T postgres psql -U postgres -d app -tAc "$1"; }

echo "== 1. start $ENGINE (compose.dev.yaml, waits for healthy)"
$COMPOSE up -d --wait "$ENGINE" || { echo "$ENGINE START FAILED"; exit 1; }

if [ "$ENGINE" = postgres ]; then
  export DATABASE_URL="postgres://app:app@localhost:${POSTGRES_PORT}/app"

  echo "== 2. app role is not superuser / createdb / createrole"
  S=$(psqlc "select rolsuper::int||'/'||rolcreatedb::int||'/'||rolcreaterole::int from pg_roles where rolname='app'")
  if [ "$S" = "0/0/0" ]; then lc_res AC-M05.8 PASS; else lc_res AC-M05.8 FAIL "$S"; fi

  echo "== 3. db:migrate twice is a no-op; db:generate finds no changes"
  pnpm --filter api db:migrate > "$LC_LOG_DIR/$LC_TASK-migrate1.log" 2>&1
  echo "migrate#1 exit=$?"
  N1=$(psqlc "select count(*) from drizzle.__drizzle_migrations")
  T1=$(psqlc "select count(*) from information_schema.tables where table_schema='public'")
  pnpm --filter api db:migrate > "$LC_LOG_DIR/$LC_TASK-migrate2.log" 2>&1
  echo "migrate#2 exit=$?"
  N2=$(psqlc "select count(*) from drizzle.__drizzle_migrations")
  T2=$(psqlc "select count(*) from information_schema.tables where table_schema='public'")
  pnpm --filter api db:generate > "$LC_LOG_DIR/$LC_TASK-generate.log" 2>&1
  GEN=$(git status --short apps/api/migrations)
  echo "journal rows $N1 -> $N2, public tables $T1 -> $T2, generate changes [$GEN]"
  if [ "$N1" = "$N2" ] && [ "$T1" = "$T2" ] && [ "${N1:-0}" -ge 1 ] && [ "${T1:-0}" -ge 1 ] && [ -z "$GEN" ]; then
    lc_res AC-M05.3 PASS
  else
    lc_res AC-M05.3 FAIL "rows $N1/$N2 tables $T1/$T2 generate=[$GEN]"
  fi

  echo "== 4. swap engine through the @module:db-* regions only"
  LC_REVERT=("${FLIPPED[@]}")
  node scripts/live-check/flip-engine.mjs "${FLIPPED[@]}"
  git diff --stat
  OTHER=$(git status --short -- apps | grep -v -F -f <(printf ' M %s\n' "${FLIPPED[@]}") || true)
  if [ -z "$OTHER" ]; then lc_res AC-M05.10 PASS; else lc_res AC-M05.10 FAIL "extra changes: $OTHER"; fi
  API_ENV=(DATABASE_URL="$DATABASE_URL" POSTGRES_TIMEOUT_MS=2000)
else
  API_ENV=(MONGO_URI="mongodb://localhost:${MONGO_PORT}/lc" MONGO_TIMEOUT_MS=2000)
fi

echo "== 5. build and boot api"
if ! pnpm --filter api build > "$LC_LOG_DIR/$LC_TASK-build.log" 2>&1; then
  tail -30 "$LC_LOG_DIR/$LC_TASK-build.log"
  lc_res BOOT FAIL build
  lc_finish
fi
if lc_start_api "${API_ENV[@]}"; then lc_res BOOT PASS; else lc_res BOOT FAIL; lc_finish; fi

echo "== 6. /health/ready: 200 up, 503 down, recovers; /health/live stays 200"
lc_wait_for /api/v1/health/ready 200 20 && R1=PASS || R1=FAIL
curl -s "localhost:$LC_PORT/api/v1/health/ready"; echo
$COMPOSE stop "$ENGINE" > /dev/null 2>&1
lc_wait_for /api/v1/health/ready 503 30 && R2=PASS || R2=FAIL
curl -s "localhost:$LC_PORT/api/v1/health/ready"; echo
L=$(lc_code /api/v1/health/live)
echo "live while down=$L (expect 200)"
$COMPOSE start "$ENGINE" > /dev/null 2>&1
lc_wait_for /api/v1/health/ready 200 60 && R3=PASS || R3=FAIL
if [ "$R1$R2$R3$L" = PASSPASSPASS200 ]; then lc_res HEALTH PASS; else lc_res HEALTH FAIL "up=$R1 down=$R2 recover=$R3 live=$L"; fi

lc_finish
