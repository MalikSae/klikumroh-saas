#!/bin/bash
# Pulls the latest code and rebuilds the React dashboard (app.klikumroh.id) on the shared server.
# Run as root: bash /www/wwwroot/klikumroh/deploy/update-dashboard.sh
# The dashboard is static files served by Nginx from dashboard/dist: there is no service to restart.
# The new build goes to dist.new first and replaces dist in one move, so a failed build never leaves the site
# without a dashboard. Backend or migration changes need more than this: see DEPLOY.md section 9.
set -euo pipefail
APP=/www/wwwroot/klikumroh
cd "$APP"
git pull --ff-only
cd dashboard
npm ci --no-audit --no-fund
# The dashboard calls the API on its own origin (https://app.klikumroh.id/api/...): VITE_API_BASE must stay unset.
unset VITE_API_BASE
rm -rf dist.new
npm run build -- --outDir dist.new --emptyOutDir
if [ ! -s dist.new/index.html ]; then
  echo "build produced no dist.new/index.html: dist is untouched" >&2
  exit 1
fi
chown -R www:www dist.new
rm -rf dist.old
if [ -d dist ]; then mv dist dist.old; fi
mv dist.new dist
rm -rf dist.old
echo "dashboard build: $(find dist -type f | wc -l) files, index.html $(stat -c %y dist/index.html | cut -d. -f1)"
# Nginx serves the files directly; ask it for the page the way a browser would (Cloudflare is not involved).
curl -sk --resolve app.klikumroh.id:443:127.0.0.1 -o /dev/null -w "dashboard https://app.klikumroh.id/ -> %{http_code}\n" https://app.klikumroh.id/
