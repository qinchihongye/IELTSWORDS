#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
ENV_FILE="$ROOT_DIR/.env"
VENV_DIR="$ROOT_DIR/.venv"
RUN_DIR="$ROOT_DIR/.run"
LOG_DIR="$ROOT_DIR/logs"
BACKEND_PID_FILE="$RUN_DIR/backend-production.pid"
BACKEND_LOG_FILE="$LOG_DIR/backend-production.log"
NGINX_SITE_NAME="ieltswords"
NGINX_AVAILABLE="/etc/nginx/sites-available/$NGINX_SITE_NAME"
NGINX_ENABLED="/etc/nginx/sites-enabled/$NGINX_SITE_NAME"

die() {
  echo "ERROR: $*" >&2
  exit 1
}

need_command() {
  command -v "$1" >/dev/null 2>&1 || die "$1 is required but was not found."
}

if [[ ! -f "$ENV_FILE" ]]; then
  die "Missing .env: $ENV_FILE"
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

SERVER_HOST="${SERVER_HOST:-127.0.0.1}"
SERVER_PORT="${SERVER_PORT:-8898}"
FRONTEND_PORT="${FRONTEND_PORT:-8899}"
PUBLIC_HOST="${PUBLIC_HOST:-111.230.11.36}"
HEALTH_URL="http://127.0.0.1:${SERVER_PORT}/health"
PUBLIC_HEALTH_URL="http://${PUBLIC_HOST}:${FRONTEND_PORT}/health"

mkdir -p "$RUN_DIR" "$LOG_DIR" "$ROOT_DIR/data/uploads" "$ROOT_DIR/data/builtin-avatars"

need_command python3
need_command npm
need_command curl

create_or_update_venv() {
  if [[ ! -x "$VENV_DIR/bin/python" ]]; then
    echo "Creating Python virtual environment..."
    python3 -m venv "$VENV_DIR"
  fi

  if ! "$VENV_DIR/bin/python" -c "import fastapi, uvicorn, sqlalchemy" >/dev/null 2>&1; then
    echo "Installing backend dependencies..."
    "$VENV_DIR/bin/pip" install -r "$BACKEND_DIR/requirements.txt"
  fi
}

build_frontend() {
  echo "Building frontend..."
  (
    cd "$FRONTEND_DIR"
    if [[ -f package-lock.json ]]; then
      npm install
    else
      npm install
    fi
    npm run build
  )
}

stop_existing_backend() {
  if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files ieltswords-backend.service >/dev/null 2>&1; then
    if systemctl is-active --quiet ieltswords-backend.service || systemctl is-enabled --quiet ieltswords-backend.service; then
      echo "Disabling existing systemd service ieltswords-backend..."
      sudo systemctl disable --now ieltswords-backend.service >/dev/null 2>&1 || true
    fi
  fi

  if [[ -f "$BACKEND_PID_FILE" ]]; then
    local old_pid
    old_pid="$(cat "$BACKEND_PID_FILE" || true)"
    if [[ -n "${old_pid:-}" ]] && kill -0 "$old_pid" >/dev/null 2>&1; then
      echo "Stopping existing backend PID $old_pid..."
      kill "$old_pid" >/dev/null 2>&1 || true
      for _ in $(seq 1 20); do
        if ! kill -0 "$old_pid" >/dev/null 2>&1; then
          break
        fi
        sleep 0.5
      done
    fi
    rm -f "$BACKEND_PID_FILE"
  fi

  if command -v lsof >/dev/null 2>&1; then
    local port_pid
    port_pid="$(lsof -ti "tcp:${SERVER_PORT}" -sTCP:LISTEN 2>/dev/null | head -n 1 || true)"
    if [[ -n "${port_pid:-}" ]]; then
      die "Port ${SERVER_PORT} is already in use by PID ${port_pid}. Stop it first or change SERVER_PORT in .env."
    fi
  fi
}

start_backend() {
  echo "Starting backend on ${SERVER_HOST}:${SERVER_PORT}..."
  : >"$BACKEND_LOG_FILE"
  (
    cd "$BACKEND_DIR"
    exec env PYTHONUNBUFFERED=1 "$VENV_DIR/bin/python" -m app.main
  ) >>"$BACKEND_LOG_FILE" 2>&1 &

  local backend_pid=$!
  echo "$backend_pid" >"$BACKEND_PID_FILE"

  for _ in $(seq 1 60); do
    if curl -fsS --max-time 3 "$HEALTH_URL" >/dev/null 2>&1; then
      echo "Backend started. PID: $backend_pid"
      return 0
    fi

    if ! kill -0 "$backend_pid" >/dev/null 2>&1; then
      echo "Backend exited during startup. Last log lines:" >&2
      tail -n 80 "$BACKEND_LOG_FILE" >&2
      rm -f "$BACKEND_PID_FILE"
      exit 1
    fi

    sleep 1
  done

  echo "Backend startup timed out. Last log lines:" >&2
  tail -n 80 "$BACKEND_LOG_FILE" >&2
  exit 1
}

write_nginx_config() {
  if ! command -v nginx >/dev/null 2>&1; then
    echo "Nginx is not installed; skipped Nginx setup."
    return 0
  fi

  if ! command -v sudo >/dev/null 2>&1; then
    echo "sudo is not available; skipped Nginx setup."
    return 0
  fi

  echo "Writing Nginx config..."
  sudo tee "$NGINX_AVAILABLE" >/dev/null <<EOF
server {
    listen ${FRONTEND_PORT};
    server_name ${PUBLIC_HOST};

    root ${ROOT_DIR}/frontend/dist;
    index index.html;

    client_max_body_size 10m;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript image/svg+xml;

    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-Frame-Options "SAMEORIGIN" always;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
        try_files \$uri =404;
    }

    location ~* \.(?:png|jpg|jpeg|webp|gif|ico|svg|woff2?|ttf)$ {
        expires 30d;
        add_header Cache-Control "public, max-age=2592000";
        try_files \$uri =404;
    }

    location /api/ai/chat/stream {
        proxy_pass http://127.0.0.1:${SERVER_PORT}/api/ai/chat/stream;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:${SERVER_PORT}/api/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location = /health {
        proxy_pass http://127.0.0.1:${SERVER_PORT}/health;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /uploads/ {
        alias ${ROOT_DIR}/data/uploads/;
        expires 7d;
        add_header Cache-Control "public";
    }

    location /builtin-avatars/ {
        alias ${ROOT_DIR}/data/builtin-avatars/;
        expires 30d;
        add_header Cache-Control "public";
    }

    location /preset-avatars/ {
        alias ${ROOT_DIR}/预设头像/;
        expires 30d;
        add_header Cache-Control "public";
    }

    location /docs {
        allow 127.0.0.1;
        allow 10.0.0.0/8;
        allow 172.16.0.0/12;
        allow 192.168.0.0/16;
        deny all;
        proxy_pass http://127.0.0.1:${SERVER_PORT}/docs;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /openapi.json {
        allow 127.0.0.1;
        allow 10.0.0.0/8;
        allow 172.16.0.0/12;
        allow 192.168.0.0/16;
        deny all;
        proxy_pass http://127.0.0.1:${SERVER_PORT}/openapi.json;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

  sudo ln -sfn "$NGINX_AVAILABLE" "$NGINX_ENABLED"
  if [[ -e /etc/nginx/sites-enabled/default ]]; then
    sudo rm -f /etc/nginx/sites-enabled/default
  fi

  sudo nginx -t
  sudo systemctl reload nginx
}

echo "Project root: $ROOT_DIR"
echo "Public URL: http://${PUBLIC_HOST}:${FRONTEND_PORT}"

create_or_update_venv
build_frontend
stop_existing_backend
start_backend
write_nginx_config

echo
echo "Production project started."
echo "- Frontend: http://${PUBLIC_HOST}:${FRONTEND_PORT}"
echo "- Backend health: ${HEALTH_URL}"
echo "- Public health: ${PUBLIC_HEALTH_URL}"
echo "- Backend log: ${BACKEND_LOG_FILE}"
