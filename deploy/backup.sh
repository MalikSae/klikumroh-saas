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

# Read .env literally (no shell expansion): passwords may contain $, #, spaces or quotes.
env_get() { grep -m1 "^$1=" "$APP/.env" | cut -d= -f2- | tr -d '\r' | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/"; }
DB_HOST=$(env_get DB_HOST); DB_PORT=$(env_get DB_PORT); DB_USER=$(env_get DB_USER); DB_PASSWORD=$(env_get DB_PASSWORD); DB_NAME=$(env_get DB_NAME)
mkdir -p "$OUT"; chmod 700 "$OUT"

# The password goes through MYSQL_PWD: an option file would cut it at characters such as # or quotes.
umask 077
MYSQL_PWD="$DB_PASSWORD" mysqldump -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" --single-transaction --routines --triggers --no-tablespaces "$DB_NAME" > "$WORK/db.sql"
[ -s "$WORK/db.sql" ] || { echo "Dump database kosong, berhenti."; exit 1; }

cp "$APP/.env" "$WORK/env.backup"
tar -czf "$OUT/klikumroh-$STAMP.tar.gz" -C "$WORK" db.sql env.backup -C "$APP" uploads storage 2>/dev/null || \
tar -czf "$OUT/klikumroh-$STAMP.tar.gz" -C "$WORK" db.sql env.backup
chmod 600 "$OUT/klikumroh-$STAMP.tar.gz"
find "$OUT" -name 'klikumroh-*.tar.gz' -mtime +"$KEEP_DAYS" -delete
ls -lh "$OUT/klikumroh-$STAMP.tar.gz"
tar -tzf "$OUT/klikumroh-$STAMP.tar.gz" | head -5
