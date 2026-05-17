#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
ENV_FILE="$ROOT_DIR/.env"
RUN_DIR="$ROOT_DIR/.run"
BACKEND_PID_FILE="$RUN_DIR/backend.pid"
FRONTEND_PID_FILE="$RUN_DIR/frontend.pid"

load_root_env() {
  if [[ -f "$ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
  fi
}

load_root_env

BACKEND_PORT="${SERVER_PORT:-5432}"
FRONTEND_PORT="${FRONTEND_PORT:-5433}"

ensure_command() {
  local cmd="$1"
  local message="$2"

  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "$message" >&2
    exit 1
  fi
}

process_cwd() {
  local pid="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1
  else
    pwdx "$pid" 2>/dev/null | awk '{print $2}'
  fi
}

process_matches_project() {
  local pid="$1"
  local expected_dir="$2"
  local command_line
  local cwd

  command_line="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  cwd="$(process_cwd "$pid")"

  [[ -n "$command_line" ]] || return 1
  [[ "$cwd" == "$expected_dir" ]] || return 1
}

kill_pid() {
  local pid="$1"

  if ! kill -0 "$pid" 2>/dev/null; then
    return 0
  fi

  kill "$pid" 2>/dev/null || true

  for _ in $(seq 1 10); do
    if ! kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
    sleep 1
  done

  kill -9 "$pid" 2>/dev/null || true
}

stop_from_pid_file() {
  local pid_file="$1"
  local expected_dir="$2"
  local label="$3"
  local stopped=0

  if [[ ! -f "$pid_file" ]]; then
    return 1
  fi

  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue

    if process_matches_project "$pid" "$expected_dir"; then
      kill_pid "$pid"
      stopped=1
    fi
  done <"$pid_file"

  rm -f "$pid_file"

  if [[ "$stopped" -eq 1 ]]; then
    echo "已停止${label}。"
    return 0
  fi

  return 1
}

stop_from_port() {
  local port="$1"
  local expected_dir="$2"
  local label="$3"
  local pids
  local pid
  local stopped=0

  if command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -ti "tcp:${port}" -sTCP:LISTEN 2>/dev/null | sort -u || true)"
  elif command -v ss >/dev/null 2>&1; then
    pids="$(ss -tlnp "sport = :${port}" 2>/dev/null | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | sort -u || true)"
  else
    echo "需要 lsof 或 ss 命令来检测端口占用。" >&2
    return 1
  fi

  if [[ -z "$pids" ]]; then
    return 1
  fi

  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue

    if process_matches_project "$pid" "$expected_dir"; then
      kill_pid "$pid"
      stopped=1
    fi
  done <<<"$pids"

  if [[ "$stopped" -eq 1 ]]; then
    echo "已停止${label}。"
    return 0
  fi

  return 1
}

ensure_command ps "未找到 ps，请先安装 ps。"

backend_stopped=0
frontend_stopped=0

if stop_from_pid_file "$BACKEND_PID_FILE" "$BACKEND_DIR" "后端"; then
  backend_stopped=1
elif stop_from_port "$BACKEND_PORT" "$BACKEND_DIR" "后端"; then
  backend_stopped=1
fi

if stop_from_pid_file "$FRONTEND_PID_FILE" "$FRONTEND_DIR" "前端"; then
  frontend_stopped=1
elif stop_from_port "$FRONTEND_PORT" "$FRONTEND_DIR" "前端"; then
  frontend_stopped=1
fi

if [[ "$backend_stopped" -eq 0 ]]; then
  echo "未发现正在运行的项目后端。"
fi

if [[ "$frontend_stopped" -eq 0 ]]; then
  echo "未发现正在运行的项目前端。"
fi
