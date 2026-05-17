#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
ENV_FILE="$ROOT_DIR/.env"
RUN_DIR="$ROOT_DIR/.run"
BACKEND_PID_FILE="$RUN_DIR/backend.pid"
FRONTEND_PID_FILE="$RUN_DIR/frontend.pid"

STARTED_BACKEND=0
STARTED_FRONTEND=0
BACKEND_PID=""
FRONTEND_PID=""

load_root_env() {
  if [[ -f "$ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
  fi
}

pick_python() {
  if [[ -n "${PYTHON_BIN:-}" ]]; then
    echo "$PYTHON_BIN"
    return
  fi

  if command -v python3 >/dev/null 2>&1; then
    command -v python3
    return
  fi

  echo "未找到可用的 python3，请先安装 Python。" >&2
  exit 1
}

PYTHON_BIN="$(pick_python)"
load_root_env

BACKEND_PORT="${SERVER_PORT:-5432}"
FRONTEND_PORT="${FRONTEND_PORT:-5433}"
BACKEND_URL="http://127.0.0.1:${BACKEND_PORT}"
FRONTEND_URL="http://127.0.0.1:${FRONTEND_PORT}"
DEV_API_BASE_URL="${VITE_API_BASE_URL:-$BACKEND_URL}"

mkdir -p "$RUN_DIR"

cleanup() {
  local exit_code=$?

  if [[ "$STARTED_FRONTEND" -eq 1 && -n "$FRONTEND_PID" ]]; then
    kill "$FRONTEND_PID" 2>/dev/null || true
    wait "$FRONTEND_PID" 2>/dev/null || true
  fi

  if [[ "$STARTED_BACKEND" -eq 1 && -n "$BACKEND_PID" ]]; then
    kill "$BACKEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
  fi

  if [[ "$STARTED_FRONTEND" -eq 1 ]]; then
    rm -f "$FRONTEND_PID_FILE"
  fi

  if [[ "$STARTED_BACKEND" -eq 1 ]]; then
    rm -f "$BACKEND_PID_FILE"
  fi

  exit "$exit_code"
}

trap cleanup INT TERM EXIT

ensure_command() {
  local cmd="$1"
  local message="$2"

  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "$message" >&2
    exit 1
  fi
}

ensure_backend_deps() {
  if ! "$PYTHON_BIN" -c "import fastapi, uvicorn, sqlalchemy" >/dev/null 2>&1; then
    echo "正在安装后端依赖..."
    (
      cd "$BACKEND_DIR"
      "$PYTHON_BIN" -m pip install -r requirements.txt
    )
  fi
}

ensure_frontend_deps() {
  if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
    echo "正在安装前端依赖..."
    (
      cd "$FRONTEND_DIR"
      npm install
    )
  fi
}

port_in_use() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -ti "tcp:${port}" -sTCP:LISTEN >/dev/null 2>&1
  elif command -v ss >/dev/null 2>&1; then
    ss -tlnp "sport = :${port}" 2>/dev/null | grep -q ":${port}"
  else
    echo "需要 lsof 或 ss 命令来检测端口占用。" >&2
    exit 1
  fi
}

write_listener_pids() {
  local port="$1"
  local pid_file="$2"

  if command -v lsof >/dev/null 2>&1; then
    lsof -ti "tcp:${port}" -sTCP:LISTEN | sort -u >"$pid_file"
  elif command -v ss >/dev/null 2>&1; then
    ss -tlnp "sport = :${port}" 2>/dev/null | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | sort -u >"$pid_file"
  fi
}

backend_is_healthy() {
  curl -fsS --max-time 5 "${BACKEND_URL}/health" 2>/dev/null | grep -q '"status":"healthy"'
}

frontend_is_serving() {
  curl -fsS --max-time 5 "${FRONTEND_URL}" 2>/dev/null | grep -q '<div id="root"></div>'
}

wait_for_backend() {
  local attempt
  for attempt in $(seq 1 60); do
    if backend_is_healthy; then
      return 0
    fi
    sleep 1
  done

  echo "后端启动超时，请检查日志输出。" >&2
  return 1
}

wait_for_frontend() {
  local attempt
  for attempt in $(seq 1 60); do
    if frontend_is_serving; then
      return 0
    fi
    sleep 1
  done

  echo "前端启动超时，请检查日志输出。" >&2
  return 1
}

start_backend() {
  if port_in_use "$BACKEND_PORT"; then
    if backend_is_healthy; then
      echo "后端已经在运行: ${BACKEND_URL}"
      return
    fi

    echo "端口 ${BACKEND_PORT} 已被占用，且不是可用的项目后端。" >&2
    echo "可用命令: lsof -nP -iTCP:${BACKEND_PORT} -sTCP:LISTEN" >&2
    exit 1
  fi

  echo "启动后端..."
  (
    cd "$BACKEND_DIR"
    exec env PYTHONUNBUFFERED=1 "$PYTHON_BIN" -m app.main
  ) &
  BACKEND_PID=$!
  STARTED_BACKEND=1

  wait_for_backend
  write_listener_pids "$BACKEND_PORT" "$BACKEND_PID_FILE"
  echo "后端已启动: ${BACKEND_URL}"
}

start_frontend() {
  if port_in_use "$FRONTEND_PORT"; then
    if frontend_is_serving; then
      echo "前端已经在运行: ${FRONTEND_URL}"
      return
    fi

    echo "端口 ${FRONTEND_PORT} 已被占用，且不是可用的项目前端。" >&2
    echo "可用命令: lsof -nP -iTCP:${FRONTEND_PORT} -sTCP:LISTEN" >&2
    exit 1
  fi

  echo "启动前端..."
  (
    cd "$FRONTEND_DIR"
    exec env VITE_API_BASE_URL="$DEV_API_BASE_URL" npm run dev -- --host 0.0.0.0 --port "$FRONTEND_PORT"
  ) &
  FRONTEND_PID=$!
  STARTED_FRONTEND=1

  wait_for_frontend
  write_listener_pids "$FRONTEND_PORT" "$FRONTEND_PID_FILE"
  echo "前端已启动: ${FRONTEND_URL}"
}

monitor_services() {
  while true; do
    if [[ "$STARTED_BACKEND" -eq 1 ]] && [[ -n "$BACKEND_PID" ]] && ! kill -0 "$BACKEND_PID" 2>/dev/null; then
      wait "$BACKEND_PID" || true
      echo "后端进程已退出。" >&2
      return 1
    fi

    if [[ "$STARTED_FRONTEND" -eq 1 ]] && [[ -n "$FRONTEND_PID" ]] && ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
      wait "$FRONTEND_PID" || true
      echo "前端进程已退出。" >&2
      return 1
    fi

    sleep 1
  done
}

ensure_command npm "未找到 npm，请先安装 Node.js。"
ensure_command curl "未找到 curl，请先安装 curl。"

ensure_backend_deps
ensure_frontend_deps

start_backend
start_frontend

cat <<EOF

项目已就绪
- 前端: ${FRONTEND_URL}
- 后端: ${BACKEND_URL}
- API 文档: ${BACKEND_URL}/docs

按 Ctrl+C 可停止本次脚本启动的服务。
EOF

monitor_services
