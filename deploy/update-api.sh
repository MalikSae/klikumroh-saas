#!/bin/bash
# Pulls the latest code, rebuilds the Go backend and restarts klikumroh-api on the shared server.
# Run as root: bash /www/wwwroot/klikumroh/deploy/update-api.sh
# Does NOT run migrations: if the release has new files in migrations/, stop the API and run
# ./bin/klikumroh-migrate up first (DEPLOY.md section 9, never "down" in production).
# The previous binary is kept as bin/klikumroh-api.prev and put back when the new one does not come up.
# The helper binaries the server runs by hand or from cron (klikumroh-migrate, klikumroh-seed-demo) are rebuilt
# too: they share the code of the API, and a stale seed binary rebuilds the demo travel from old code.
set -euo pipefail
export PATH=$PATH:/usr/local/go/bin
APP=/www/wwwroot/klikumroh
BIN=$APP/bin/klikumroh-api
cd "$APP"
git pull --ff-only
CGO_ENABLED=0 go build -o "$BIN.new" ./cmd/api
# Everything is built before anything is replaced: a compile error leaves the running server untouched.
TOOLS="klikumroh-migrate:./cmd/migrate klikumroh-seed-demo:./cmd/seed-demo"
for t in $TOOLS; do
  CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o "$APP/bin/${t%%:*}.new" "${t#*:}"
done
# The binaries must be readable and executable by www (a root-only file makes systemd fail with 203/EXEC;
# demo-reset.sh runs the seed as www).
chown www:www "$BIN.new"
chmod 755 "$BIN.new"
for t in $TOOLS; do
  chown www:www "$APP/bin/${t%%:*}.new"
  chmod 755 "$APP/bin/${t%%:*}.new"
  mv "$APP/bin/${t%%:*}.new" "$APP/bin/${t%%:*}"
done
[ -f "$BIN" ] && cp -a "$BIN" "$BIN.prev"
mv "$BIN.new" "$BIN"
systemctl restart klikumroh-api
sleep 3
if systemctl is-active --quiet klikumroh-api && [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:18080/api/public/platform-settings)" = "200" ]; then
  echo "api OK (active, 200)"
else
  echo "API gagal start. Mengembalikan binary sebelumnya."
  if [ -f "$BIN.prev" ]; then
    cp -a "$BIN.prev" "$BIN"
    systemctl restart klikumroh-api
    sleep 3
    systemctl is-active klikumroh-api || true
  fi
  journalctl -u klikumroh-api -n 15 --no-pager | cut -c1-200
  exit 1
fi
