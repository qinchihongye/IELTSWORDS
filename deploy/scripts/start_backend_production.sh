#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
ENV_FILE="$ROOT_DIR/.env"
VENV_DIR="$ROOT_DIR/.venv"
RUN_DIR="$ROOT_DIR/.run"
LOG_DIR="$ROOT_DIR/logs"
PID_FILE="$RUN_DIR/backend-production.pid"
LOG_FILE="$LOG_DIR/backend-production.log"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing .env: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

SERVER_HOST="${SERVER_HOST:-127.0.0.1}"
SERVER_PORT="${SERVER_PORT:-8898}"
HEALTH_URL="http://127.0.0.1:${SERVER_PORT}/health"

mkdir -p "$RUN_DIR" "$LOG_DIR"

if [[ ! -x "$VENV_DIR/bin/python" ]]; then
  echo "Creating Python virtual environment..."
  python3 -m venv "$VENV_DIR"
fi

if ! "$VENV_DIR/bin/python" -c "import fastapi, uvicorn, sqlalchemy" >/dev/null 2>&1; then
  echo "Installing backend dependencies..."
  "$VENV_DIR/bin/pip" install -r "$BACKEND_DIR/requirements.txt"
fi

if [[ -f "$PID_FILE" ]]; then
  OLD_PID="$(cat "$PID_FILE" || true)"
  if [[ -n "${OLD_PID:-}" ]] && kill -0 "$OLD_PID" >/dev/null 2>&1; then
    echo "Backend is already running. PID: $OLD_PID"
    echo "Health: $HEALTH_URL"
    exit 0
  fi
  rm -f "$PID_FILE"
fi

if command -v lsof >/dev/null 2>&1; then
  EXISTING_PID="$(lsof -ti "tcp:${SERVER_PORT}" -sTCP:LISTEN 2>/dev/null | head -n 1 || true)"
  if [[ -n "${EXISTING_PID:-}" ]]; then
    echo "Port ${SERVER_PORT} is already in use by PID ${EXISTING_PID}." >&2
    echo "Stop that process first, or change SERVER_PORT in .env." >&2
    exit 1
  fi
fi

echo "Starting backend on ${SERVER_HOST}:${SERVER_PORT}..."
(
  cd "$BACKEND_DIR"
  exec env PYTHONUNBUFFERED=1 "$VENV_DIR/bin/python" -m app.main
) >>"$LOG_FILE" 2>&1 &

BACKEND_PID=$!
echo "$BACKEND_PID" >"$PID_FILE"

for _ in $(seq 1 60); do
  if curl -fsS --max-time 3 "$HEALTH_URL" >/dev/null 2>&1; then
    echo "Backend started successfully."
    echo "PID: $BACKEND_PID"
    echo "Health: $HEALTH_URL"
    echo "Log: $LOG_FILE"
    exit 0
  fi

  if ! kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    echo "Backend exited during startup. Last log lines:" >&2
    tail -n 80 "$LOG_FILE" >&2
    rm -f "$PID_FILE"
    exit 1
  fi

  sleep 1
done

echo "Backend startup timed out. Last log lines:" >&2
tail -n 80 "$LOG_FILE" >&2
exit 1
