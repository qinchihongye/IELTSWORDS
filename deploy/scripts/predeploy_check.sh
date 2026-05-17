#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
ENV_FILE="$ROOT_DIR/.env"

pick_python() {
  if [[ -n "${PYTHON_BIN:-}" ]]; then
    echo "$PYTHON_BIN"
    return
  fi

  if command -v python3 >/dev/null 2>&1; then
    command -v python3
    return
  fi

  echo "python3 is required but was not found." >&2
  exit 1
}

PYTHON_BIN="$(pick_python)"

section() {
  printf "\n== %s ==\n" "$1"
}

section "Required files"
required_files=(
  "$ROOT_DIR/backend/requirements.txt"
  "$ROOT_DIR/.env.example"
  "$ROOT_DIR/db/ielts_words.db"
  "$FRONTEND_DIR/package.json"
)

for file in "${required_files[@]}"; do
  if [[ ! -e "$file" ]]; then
    echo "Missing required file: $file" >&2
    exit 1
  fi
  echo "ok: $file"
done

if [[ ! -f "$ENV_FILE" ]]; then
  echo "warning: .env does not exist. Production needs SECRET_KEY, FERNET_KEY, and VITE_API_BASE_URL."
else
  if ! grep -q '^SECRET_KEY=' "$ENV_FILE"; then
    echo "warning: .env exists but SECRET_KEY was not found."
  fi
  if ! grep -q '^FERNET_KEY=' "$ENV_FILE"; then
    echo "warning: .env exists but FERNET_KEY was not found."
  fi
  if ! grep -q '^VITE_API_BASE_URL=' "$ENV_FILE"; then
    echo "warning: .env exists but VITE_API_BASE_URL was not found."
  fi
fi

section "Python syntax"
"$PYTHON_BIN" -m compileall "$ROOT_DIR/backend/app"

section "Frontend lint"
(
  cd "$FRONTEND_DIR"
  npm run lint
)

section "Frontend build"
(
  cd "$FRONTEND_DIR"
  npm run build
)

section "Database sanity"
if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$ROOT_DIR/db/ielts_words.db" "SELECT 'words=' || count(*) FROM words;"
  if [[ ! -f "$ROOT_DIR/db/ielts_words_app.db" ]]; then
    echo "warning: db/ielts_words_app.db does not exist yet. This is acceptable before first initialization."
  fi
else
  echo "warning: sqlite3 not found; skipped database sanity query."
fi

section "Git hygiene"
if git -C "$ROOT_DIR" status --short | grep -E '(^|/)(\.env|backend/\.env|frontend/dist|node_modules)' >/dev/null; then
  echo "warning: sensitive/generated paths appear in git status. Review before committing."
fi

echo
echo "Predeploy checks completed."
