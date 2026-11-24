#!/usr/bin/env bash
# Shared helpers for one-shot live checks (real databases in Docker). Source it, do not run it:
#   . "$(dirname "${BASH_SOURCE[0]}")/lib.sh"; lc_init <task> [timeout-seconds]
# Guarantees: private compose project (lc-<task>), spare host ports, hard timeout, and teardown
# (processes killed, containers and volumes removed, flipped files reverted) on every exit path.
# Never touches containers outside its own compose project.

lc_init() {
  LC_TASK=$1
  LC_TIMEOUT=${2:-480}
  cd "$(git rev-parse --show-toplevel)" || exit 1
  LC_LOG_DIR=${LC_LOG_DIR:-.tasks/.result/logs}
  mkdir -p "$LC_LOG_DIR"
  exec > >(tee "$LC_LOG_DIR/$LC_TASK-live-check.log") 2>&1
  export POSTGRES_PORT=${POSTGRES_PORT:-5433} MONGO_PORT=${MONGO_PORT:-27018}
  LC_PORT=${LC_PORT:-3915}
  COMPOSE="docker compose -p lc-$LC_TASK -f compose.dev.yaml"
  LC_PIDS=() LC_REVERT=() LC_RES=()
  docker info > /dev/null 2>&1 || { echo "ABORT: Docker is not running"; exit 1; }
  local p
  for p in "$POSTGRES_PORT" "$MONGO_PORT" "$LC_PORT"; do
    if (exec 3<> "/dev/tcp/127.0.0.1/$p") 2> /dev/null; then echo "ABORT: port $p is busy"; exit 1; fi
  done
  trap 'exit 1' TERM INT
  trap lc_cleanup EXIT
  ( sleep "$LC_TIMEOUT"; echo "TIMEOUT after ${LC_TIMEOUT}s"; kill -TERM $$ ) & LC_WD=$!
}

lc_cleanup() {
  trap - EXIT
  kill "$LC_WD" 2> /dev/null
  local pid
  for pid in "${LC_PIDS[@]}"; do kill "$pid" 2> /dev/null; done
  wait 2> /dev/null
  if [ "${#LC_REVERT[@]}" -gt 0 ]; then
    git checkout -- "${LC_REVERT[@]}" && echo "reverted: ${LC_REVERT[*]}"
    echo "tracked changes left: [$(git status --short -- "${LC_REVERT[@]}")]"
  fi
  $COMPOSE down -v 2>&1 | tail -3
}

lc_code() { curl -s -o /dev/null -w '%{http_code}' "localhost:$LC_PORT$1"; }

# lc_wait_for <path> <expected-status> <tries>  (1 try per second)
lc_wait_for() {
  local i
  for i in $(seq 1 "$3"); do [ "$(lc_code "$1")" = "$2" ] && return 0; sleep 1; done
  return 1
}

# lc_start_api <ENV=value>...  Boots apps/api/dist/main.js (build first) and waits for /health/live.
lc_start_api() {
  env PORT="$LC_PORT" NODE_ENV=development CORS_ORIGIN=http://localhost:3000 "$@" \
    node apps/api/dist/main.js > "$LC_LOG_DIR/$LC_TASK-server.log" 2>&1 &
  LC_PIDS+=($!)
  lc_wait_for /api/v1/health/live 200 30 || { echo "API DID NOT BOOT"; tail -30 "$LC_LOG_DIR/$LC_TASK-server.log"; return 1; }
}

# lc_res <name> <PASS|FAIL> [detail]
lc_res() { LC_RES+=("$1 $2${3:+ ($3)}"); echo ">> $1 $2${3:+ ($3)}"; }

# lc_finish: print the summary and exit non-zero when any check failed.
lc_finish() {
  echo "== SUMMARY"
  printf '%s\n' "${LC_RES[@]}"
  echo "LIVE_CHECK_END"
  printf '%s\n' "${LC_RES[@]}" | grep -q ' FAIL' && exit 1
  exit 0
}
