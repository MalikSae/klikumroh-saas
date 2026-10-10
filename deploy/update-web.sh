#!/bin/bash
# Pulls the latest code, rebuilds the Next.js web and restarts klikumroh-web on the shared server.
# Run as root: bash /www/wwwroot/klikumroh/deploy/update-web.sh
# Backend or migration changes need more than this: see DEPLOY.md section 9.
set -euo pipefail
APP=/www/wwwroot/klikumroh
cd "$APP"
git pull --ff-only
cd web
npm ci --no-audit --no-fund
BACKEND_INTERNAL_URL=http://127.0.0.1:18080 npm run build
S=.next/standalone/web
mkdir -p "$S/.next"
rm -rf "$S/.next/static" "$S/public"
cp -r .next/static "$S/.next/static"
cp -r public "$S/public"
chown -R www:www .next/standalone
systemctl restart klikumroh-web
sleep 3
systemctl is-active klikumroh-web
curl -s -o /dev/null -w "web 127.0.0.1:13000 -> %{http_code}\n" http://127.0.0.1:13000/
