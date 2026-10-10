#!/bin/bash
# Daily KlikUmroh backup: database dump + uploads + storage + .env. Keeps the newest 14 days.
# Run as root from anywhere: bash /www/wwwroot/klikumroh/deploy/backup.sh
# Output: /www/backup/klikumroh/klikumroh-YYYYmmdd-HHMM.tar.gz (chmod 600, holds .env: never copy it to a public place).
set -euo pipefail
APP=/www/wwwroot/klikumroh
OUT=/www/backup/klikumroh
KEEP_DAYS=14
STAMP=$(date +%Y%m%d-%H%M)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

set -a; . "$APP/.env"; set +a
mkdir -p "$OUT"; chmod 700 "$OUT"

# Credentials go through a temp option file so they never show up in the process list.
CNF="$WORK/my.cnf"
umask 077
printf '[client]\nuser=%s\npassword=%s\nhost=%s\nport=%s\n' "$DB_USER" "$DB_PASSWORD" "$DB_HOST" "${DB_PORT:-3306}" > "$CNF"
mysqldump --defaults-extra-file="$CNF" --single-transaction --routines --triggers --no-tablespaces "$DB_NAME" > "$WORK/db.sql"
[ -s "$WORK/db.sql" ] || { echo "Dump database kosong, berhenti."; exit 1; }

cp "$APP/.env" "$WORK/env.backup"
tar -czf "$OUT/klikumroh-$STAMP.tar.gz" -C "$WORK" db.sql env.backup -C "$APP" uploads storage 2>/dev/null || \
tar -czf "$OUT/klikumroh-$STAMP.tar.gz" -C "$WORK" db.sql env.backup
chmod 600 "$OUT/klikumroh-$STAMP.tar.gz"
find "$OUT" -name 'klikumroh-*.tar.gz' -mtime +"$KEEP_DAYS" -delete
ls -lh "$OUT/klikumroh-$STAMP.tar.gz"
tar -tzf "$OUT/klikumroh-$STAMP.tar.gz" | head -5
