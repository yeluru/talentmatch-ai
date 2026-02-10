#!/usr/bin/env bash
# Concatenate all timestamped migrations (excludes RUN_IF_MISSING*) in order.
# Usage: ./run-all-migrations.sh > all_migrations.sql
# Then open all_migrations.sql and run it in Supabase Studio → SQL Editor.
# Note: If your DB already has some migrations applied, you may see "already exists" errors for those; you can ignore them or run only the migrations you need.

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$(dirname "$SCRIPT_DIR")/migrations"
shopt -s nullglob
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  echo "-- ========== $(basename "$f") =========="
  cat "$f"
  echo ""
  echo ""
done < <(ls -1 "$MIGRATIONS_DIR"/[0-9]*.sql 2>/dev/null | sort)
