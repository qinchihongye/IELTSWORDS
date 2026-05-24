#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
PID_FILE="$ROOT_DIR/.run/backend-production.pid"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

SERVER_PORT="${SERVER_PORT:-8889}"

if [[ -f "$PID_FILE" ]]; then
  BACKEND_PID="$(cat "$PID_FILE" || true)"
  if [[ -n "${BACKEND_PID:-}" ]] && kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    echo "Stopping backend PID $BACKEND_PID..."
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
    for _ in $(seq 1 20); do
      if ! kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
        break
      fi
      sleep 0.5
    done
  fi
  rm -f "$PID_FILE"
else
  echo "No backend PID file found."
fi

if command -v lsof >/dev/null 2>&1; then
  PORT_PID="$(lsof -ti "tcp:${SERVER_PORT}" -sTCP:LISTEN 2>/dev/null | head -n 1 || true)"
  if [[ -n "${PORT_PID:-}" ]]; then
    echo "Port ${SERVER_PORT} is still used by PID ${PORT_PID}."
  fi
fi

echo "Production backend stopped."
