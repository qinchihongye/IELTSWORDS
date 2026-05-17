#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DB_PATH="${1:-$ROOT_DIR/db/ielts_words_app.db}"
BACKUP_DIR="${2:-$ROOT_DIR/db/backups}"

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "sqlite3 is required but was not found." >&2
  exit 1
fi

if [[ ! -f "$DB_PATH" ]]; then
  echo "Database not found: $DB_PATH" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

timestamp="$(date +%Y%m%d-%H%M%S)"
backup_path="$BACKUP_DIR/ielts_words_app-$timestamp.db"

sqlite3 "$DB_PATH" ".backup '$backup_path'"
sqlite3 "$backup_path" "PRAGMA integrity_check;" | grep -qx "ok"

echo "Backup created: $backup_path"

# 保留策略：删除 30 天前的备份
find "$BACKUP_DIR" -name 'ielts_words_app-*.db' -mtime +30 -delete 2>/dev/null || true
