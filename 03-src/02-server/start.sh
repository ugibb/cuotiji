#!/usr/bin/env bash
# Server start script (macOS / Linux)
# Usage:
#   ./start.sh        dev mode (npm run dev)
#   ./start.sh prod   prod mode (npm run start, requires build)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: node is not installed." >&2
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "Installing dependencies..."
  npm install
fi

MODE="${1:-dev}"

# 与 src/index.ts（dotenv）一致：优先环境变量，其次 .env，最后默认 3001
load_port() {
  if [[ -n "${PORT:-}" ]]; then
    return
  fi
  if [[ -f .env ]]; then
    local env_port
    env_port="$(grep -E '^[[:space:]]*PORT=' .env | tail -n1 | cut -d= -f2- | tr -d ' "'\''')"
    if [[ -n "$env_port" ]]; then
      PORT="$env_port"
      return
    fi
  fi
  PORT=3001
}

load_port
export PORT

kill_port_process() {
  local port="$1"
  local pids
  pids="$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    echo "Port $port is in use, killing process(es): $pids"
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null || true
    sleep 1
    # 若仍未释放，再试一次
    pids="$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null || true)"
    if [[ -n "$pids" ]]; then
      # shellcheck disable=SC2086
      kill -9 $pids 2>/dev/null || true
      sleep 1
    fi
  fi
}

if [[ "$MODE" == "prod" ]]; then
  if [[ ! -f dist/index.js ]]; then
    echo "Error: dist/index.js not found, run npm run build first." >&2
    exit 1
  fi
  kill_port_process "$PORT"
  echo "Prod mode: npm run start (port: $PORT)"
  exec npm run start
fi

kill_port_process "$PORT"
echo "Dev mode: npm run dev (cwd: $ROOT, port: $PORT)"
exec npm run dev
