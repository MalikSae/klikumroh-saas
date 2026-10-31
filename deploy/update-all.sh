#!/bin/bash
# One-command release on the shared server: pulls once, then runs the update script of each part that changed.
# Run as root: bash /www/wwwroot/klikumroh/deploy/update-all.sh [api] [web] [dashboard]
# With no arguments the parts are picked by comparing HEAD with the commit each part was LAST DEPLOYED at
# (cmd/ internal/ go.mod go.sum -> api, web/ panduan/ -> web, dashboard/ -> dashboard). The commit is remembered in
# .git/klikumroh-deployed-<part>, so it does not matter whether the pull happened here or by hand earlier.
# Before a part has a remembered commit (first run) the comparison falls back to what this pull brought in;
# when that is empty, name the parts explicitly once: update-all.sh api web dashboard.
# Stops BEFORE deploying when migrations/ changed since the last api deploy: stop the API and run
# ./bin/klikumroh-migrate up first (DEPLOY.md section 9, never "down" in production), then run this again
# with the parts named. The api commit is only remembered after a successful update, so a stopped run repeats.
set -euo pipefail
APP=/www/wwwroot/klikumroh
cd "$APP"

OLD=$(git rev-parse HEAD)
git pull --ff-only
NEW=$(git rev-parse HEAD)
STATE=$(git rev-parse --git-dir)

# since <part>: the commit to compare against (last deployed, else the commit before this pull).
since() {
  local f="$STATE/klikumroh-deployed-$1" c=""
  [ -f "$f" ] && c=$(cat "$f")
  if [ -n "$c" ] && git cat-file -e "$c^{commit}" 2>/dev/null; then echo "$c"; else echo "$OLD"; fi
}
# changed <part> <grep pattern>: does the diff since the last deploy of <part> touch the pattern?
changed() { git diff --name-only "$(since "$1")" "$NEW" | grep -qE "$2"; }

API_SINCE=$(since api)
if git diff --name-only "$API_SINCE" "$NEW" | grep -q '^migrations/'; then
  echo "Ada migrasi baru sejak deploy api terakhir ($API_SINCE):" >&2
  git diff --name-only "$API_SINCE" "$NEW" | grep '^migrations/' >&2
  echo "Hentikan API, jalankan ./bin/klikumroh-migrate up, lalu jalankan skrip ini lagi dengan: api web dashboard" >&2
  exit 1
fi

if [ "$#" -gt 0 ]; then
  PARTS="$*"
else
  PARTS=""
  changed api '^(cmd/|internal/|go\.(mod|sum))' && PARTS="$PARTS api"
  changed web '^(web/|panduan/|scripts/build-panduan\.js)' && PARTS="$PARTS web"
  changed dashboard '^dashboard/' && PARTS="$PARTS dashboard"
fi

if [ -z "${PARTS// /}" ]; then
  echo "Tidak ada bagian yang berubah sejak deploy terakhir (HEAD ${NEW:0:7})."
  echo "Kalau ini deploy pertama dengan skrip ini dan Anda sudah pull sendiri: bash deploy/update-all.sh api web dashboard"
  exit 0
fi

echo "Deploy: $PARTS (HEAD ${NEW:0:7})"
for p in $PARTS; do
  case "$p" in
    api|web|dashboard)
      echo "== update-$p =="
      bash "$APP/deploy/update-$p.sh"
      # set -e: reaching this line means the update succeeded.
      echo "$NEW" > "$STATE/klikumroh-deployed-$p"
      ;;
    *) echo "Bagian tidak dikenal: $p (pilih api, web, dashboard)" >&2; exit 2 ;;
  esac
done
echo "Selesai."
