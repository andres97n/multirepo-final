#!/usr/bin/env bash
# Live check: a tree PRUNED to Postgres (no auth) builds and runs in Docker via `pnpm docker:smoke`.
# Usage (repo root): bash scripts/live-check/docker-postgres.sh
# Copies the current working tree (tracked + untracked, not ignored) to a temp dir, prunes it with
# `modules:apply --db=postgres --without=auth`, installs, rebuilds the migration journal, then runs the
# smoke script there. The smoke script runs the migrations itself. Hard timeout 1200 s; the temp dir
# is always removed. Logs: .tasks/.result/logs/docker-postgres-live-check.log
set -uo pipefail
MAIN=$(git rev-parse --show-toplevel) || exit 1
cd "$MAIN" || exit 1
LOG_DIR="$MAIN/.tasks/.result/logs"
mkdir -p "$LOG_DIR"
exec > >(tee "$LOG_DIR/docker-postgres-live-check.log") 2>&1

TMP=$(mktemp -d)
( sleep 1200; echo "TIMEOUT after 1200s"; kill -TERM $$ ) & WD=$!
trap 'exit 1' TERM INT
trap 'kill "$WD" 2> /dev/null; rm -rf "$TMP"' EXIT

echo "== copy working tree to $TMP"
git ls-files -co --exclude-standard -z \
  | while IFS= read -r -d '' f; do [ -e "$f" ] && printf '%s\0' "$f"; done \
  | tar --null -T - -cf - \
  | tar -xf - -C "$TMP" || { echo "COPY FAILED"; exit 1; }
cd "$TMP" || exit 1

echo "== prune to postgres, without auth"
node scripts/modules.mjs apply --db=postgres --without=auth | tail -3 || { echo "APPLY FAILED"; exit 1; }
echo "== install"
pnpm install --no-frozen-lockfile > "$LOG_DIR/docker-postgres-install.log" 2>&1 || { echo "INSTALL FAILED (see docker-postgres-install.log)"; exit 1; }
echo "== rebuild migration journal"
pnpm --filter api db:generate | tail -1 || { echo "DB:GENERATE FAILED"; exit 1; }

echo "== docker:smoke (postgres)"
node scripts/docker-smoke.mjs
CODE=$?
echo "SMOKE EXIT $CODE"
exit "$CODE"
