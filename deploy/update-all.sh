#!/bin/bash
# One-command release on the shared server: pulls once, then runs the update script of each part that changed.
# Run as root: bash /www/wwwroot/klikumroh/deploy/update-all.sh [api] [web] [dashboard]
# With no arguments the parts are picked from the files that changed in the pull (cmd/ internal/ -> api,
# web/ -> web, dashboard/ -> dashboard). Name parts explicitly to force them.
# Stops BEFORE deploying when the pull brings new files in migrations/: stop the API and run
# ./bin/klikumroh-migrate up first (DEPLOY.md section 9, never "down" in production), then run this again.
set -euo pipefail
APP=/www/wwwroot/klikumroh
cd "$APP"

OLD=$(git rev-parse HEAD)
git pull --ff-only
NEW=$(git rev-parse HEAD)
CHANGED=$(git diff --name-only "$OLD" "$NEW")

if echo "$CHANGED" | grep -q '^migrations/'; then
  echo "Rilis ini membawa migrasi baru:" >&2
  echo "$CHANGED" | grep '^migrations/' >&2
  echo "Hentikan API, jalankan ./bin/klikumroh-migrate up, lalu jalankan skrip ini lagi dengan: api web dashboard" >&2
  exit 1
fi

if [ "$#" -gt 0 ]; then
  PARTS="$*"
else
  PARTS=""
  echo "$CHANGED" | grep -qE '^(cmd/|internal/|go\.(mod|sum))' && PARTS="$PARTS api"
  echo "$CHANGED" | grep -q '^web/' && PARTS="$PARTS web"
  echo "$CHANGED" | grep -q '^dashboard/' && PARTS="$PARTS dashboard"
fi

if [ -z "${PARTS// /}" ]; then
  echo "Tidak ada bagian yang berubah ($OLD..$NEW). Tidak ada yang di-deploy."
  exit 0
fi

echo "Deploy: $PARTS ($(git log --oneline "$OLD..$NEW" | wc -l) commit baru)"
for p in $PARTS; do
  case "$p" in
    api|web|dashboard) echo "== update-$p =="; bash "$APP/deploy/update-$p.sh" ;;
    *) echo "Bagian tidak dikenal: $p (pilih api, web, dashboard)" >&2; exit 2 ;;
  esac
done
echo "Selesai."
