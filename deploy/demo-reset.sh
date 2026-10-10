#!/bin/bash
# Nightly reset of the demo travel (demo.klikumroh.id): deletes the is_demo tenant and builds it again.
# Cron runs it as root; the seed itself runs as www so the uploads stay owned by www.
# Needs /root/.klikumroh-demo.env (chmod 600, outside the repo) with single-quoted values:
#   DEMO_ADMIN_EMAIL='...'  DEMO_ADMIN_PASSWORD='...'  DEMO_AGENT_EMAIL='...'  DEMO_AGENT_PASSWORD='...'
set -euo pipefail
APP=/www/wwwroot/klikumroh
CRED=/root/.klikumroh-demo.env
[ -f "$CRED" ] || { echo "$(date -Is) $CRED tidak ada, berhenti."; exit 1; }
set -a; . "$CRED"; set +a
cd "$APP"
echo "$(date -Is) reset demo"
exec runuser -u www -- env \
  DEMO_ADMIN_EMAIL="$DEMO_ADMIN_EMAIL" DEMO_ADMIN_PASSWORD="$DEMO_ADMIN_PASSWORD" \
  DEMO_AGENT_EMAIL="$DEMO_AGENT_EMAIL" DEMO_AGENT_PASSWORD="$DEMO_AGENT_PASSWORD" \
  ./bin/klikumroh-seed-demo --reset
