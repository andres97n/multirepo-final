#!/usr/bin/env bash
# Live check: a tree PRUNED by `modules:apply --db=postgres` works against a REAL Postgres in Docker.
# Usage (repo root): bash scripts/live-check/modules-postgres.sh <auth|no-auth>
# Outer phase: detached worktree of HEAD, apply, install, build api, db:generate (rebuilds the migration
# journal for the selection, like /scaffold; no timeout). Inner phase (lib.sh: private
# compose project, ports 5433/3915, 480s timeout, teardown) runs inside the worktree; the worktree is always removed.
#   COMPOSE  the pruned compose.dev.yaml has only the postgres service
#   ROLE     app role is not superuser / createdb / createrole (AC-M05.8)
#   MIGRATE  db:migrate twice is a no-op; db:generate finds no changes; no-auth: no users/sessions tables
#   BOOT, HEALTH  /health/ready 200 up, 503 down (live stays 200), recovers
#   AUTH     auth: seed:admin, login 200, /auth/me 200 with Bearer and 401 without; no-auth: /auth/login 404
MODE=${1:-}
case "$MODE" in
  auth) APPLY=(--db=postgres) ;;
  no-auth) APPLY=(--db=postgres --without=auth) ;;
  *) echo "usage: modules-postgres.sh <auth|no-auth>"; exit 2 ;;
esac
SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -z "${LC_INNER:-}" ]; then
  MAIN=$(git rev-parse --show-toplevel)
  WT=$(mktemp -d)/wt
  git -C "$MAIN" worktree add --detach "$WT" HEAD > /dev/null || exit 1
  (
    cd "$WT" || exit 1
    node scripts/modules.mjs apply "${APPLY[@]}" | tail -3 &&
      pnpm install --no-frozen-lockfile > /dev/null &&
      pnpm turbo run build --filter=api... > /dev/null &&
      pnpm --filter api db:generate | tail -1 &&
      LC_INNER=1 LC_LOG_DIR="$MAIN/.tasks/.result/logs" bash "$SELF/modules-postgres.sh" "$MODE"
  )
  CODE=$?
  git -C "$MAIN" worktree remove --force "$WT" && echo "worktree removed"
  exit $CODE
fi

. "$SELF/lib.sh"
lc_init "modules-postgres-$MODE"
psqlc() { $COMPOSE exec -T postgres psql -U postgres -d app -tAc "$1"; }
export DATABASE_URL="postgres://app:app@localhost:${POSTGRES_PORT}/app"

echo "== 1. pruned compose has only postgres"
S=$($COMPOSE config --services | tr '\n' ' ')
if [ "$S" = "postgres " ]; then lc_res COMPOSE PASS; else lc_res COMPOSE FAIL "services: $S"; fi
$COMPOSE up -d --wait postgres || { echo "POSTGRES START FAILED"; exit 1; }

echo "== 2. app role is not superuser / createdb / createrole"
S=$(psqlc "select rolsuper::int||'/'||rolcreatedb::int||'/'||rolcreaterole::int from pg_roles where rolname='app'")
if [ "$S" = "0/0/0" ]; then lc_res ROLE PASS; else lc_res ROLE FAIL "$S"; fi

echo "== 3. db:migrate twice is a no-op; db:generate finds no changes"
TABLES="select string_agg(table_name, ',' order by table_name) from information_schema.tables where table_schema='public'"
pnpm --filter api db:migrate > "$LC_LOG_DIR/$LC_TASK-migrate1.log" 2>&1; M1=$?
T1=$(psqlc "$TABLES")
pnpm --filter api db:migrate > "$LC_LOG_DIR/$LC_TASK-migrate2.log" 2>&1; M2=$?
T2=$(psqlc "$TABLES")
migrations_hash() { find apps/api/migrations -type f -exec md5sum {} + | sort; }
BEFORE=$(migrations_hash)
pnpm --filter api db:generate > "$LC_LOG_DIR/$LC_TASK-generate.log" 2>&1
GEN=$(diff <(echo "$BEFORE") <(migrations_hash))
echo "migrate exit $M1/$M2, tables [$T1] -> [$T2], generate changes [$GEN]"
WANT=$([ "$MODE" = auth ] && echo "sessions,users" || echo "")
if [ "$M1$M2" = 00 ] && [ "$T1" = "$WANT" ] && [ "$T2" = "$WANT" ] && [ -z "$GEN" ]; then
  lc_res MIGRATE PASS
else
  lc_res MIGRATE FAIL "exit $M1/$M2 tables [$T1]/[$T2] want [$WANT] generate=[$GEN]"
  tail -15 "$LC_LOG_DIR/$LC_TASK-migrate1.log"
fi

echo "== 4. boot api"
API_ENV=(DATABASE_URL="$DATABASE_URL" POSTGRES_TIMEOUT_MS=2000)
[ "$MODE" = auth ] && API_ENV+=(JWT_ACCESS_SECRET="$(node -e "process.stdout.write(require('crypto').randomBytes(48).toString('base64url'))")")
if lc_start_api "${API_ENV[@]}"; then lc_res BOOT PASS; else lc_res BOOT FAIL; lc_finish; fi

echo "== 5. auth flow"
if [ "$MODE" = auth ]; then
  EMAIL=admin@live-check.test PASS='Live-check-Passw0rd-2026!'
  env "${API_ENV[@]}" SEED_ADMIN_EMAIL="$EMAIL" SEED_ADMIN_PASSWORD="$PASS" \
    pnpm --filter api seed:admin > "$LC_LOG_DIR/$LC_TASK-seed.log" 2>&1; SEED=$?
  TOKEN=$(curl -s -X POST "localhost:$LC_PORT/api/v1/auth/login" -H 'content-type: application/json' \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{process.stdout.write(JSON.parse(s).accessToken??'')}catch{}})")
  ME=$(curl -s -o /dev/null -w '%{http_code}' -H "authorization: Bearer $TOKEN" "localhost:$LC_PORT/api/v1/auth/me")
  ANON=$(lc_code /api/v1/auth/me)
  ROWS=$(psqlc "select count(*) from users where email='$EMAIL'")
  echo "seed exit=$SEED token=${TOKEN:+yes} me=$ME anon=$ANON users=$ROWS"
  if [ "$SEED" = 0 ] && [ -n "$TOKEN" ] && [ "$ME" = 200 ] && [ "$ANON" = 401 ] && [ "$ROWS" = 1 ]; then
    lc_res AUTH PASS
  else
    lc_res AUTH FAIL "seed=$SEED token=${TOKEN:+yes} me=$ME anon=$ANON users=$ROWS"
    tail -15 "$LC_LOG_DIR/$LC_TASK-seed.log"
  fi
else
  C=$(curl -s -o /dev/null -w '%{http_code}' -X POST "localhost:$LC_PORT/api/v1/auth/login" -H 'content-type: application/json' -d '{}')
  if [ "$C" = 404 ]; then lc_res NO-AUTH PASS; else lc_res NO-AUTH FAIL "/auth/login=$C"; fi
fi

echo "== 6. /health/ready: 200 up, 503 down, recovers; /health/live stays 200"
lc_wait_for /api/v1/health/ready 200 20 && R1=PASS || R1=FAIL
$COMPOSE stop postgres > /dev/null 2>&1
lc_wait_for /api/v1/health/ready 503 30 && R2=PASS || R2=FAIL
L=$(lc_code /api/v1/health/live)
$COMPOSE start postgres > /dev/null 2>&1
lc_wait_for /api/v1/health/ready 200 60 && R3=PASS || R3=FAIL
if [ "$R1$R2$R3$L" = PASSPASSPASS200 ]; then lc_res HEALTH PASS; else lc_res HEALTH FAIL "up=$R1 down=$R2 recover=$R3 live=$L"; fi

lc_finish
