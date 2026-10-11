#!/bin/bash
# Makes the shared aaPanel Nginx send unknown HTTPS hosts (travel custom domains) to KlikUmroh (DEPLOY.md 7.4).
# Run as root: bash /www/wwwroot/klikumroh/deploy/install-default-host.sh
# Adds ONE new file (0.klikumroh-default.conf) and touches no existing vhost. Nothing is reloaded unless
# "nginx -t" passes; if it fails the new file is removed again. To undo: delete the file and reload.
set -euo pipefail
NGINX=/www/server/nginx/sbin/nginx
SRC=/www/wwwroot/klikumroh/deploy/nginx-klikumroh-default.conf
DST=/www/server/panel/vhost/nginx/0.klikumroh-default.conf

if "$NGINX" -T 2>/dev/null | grep -E "listen[^;]*443[^;]*default_server" | grep -v "^#"; then
  if [ ! -f "$DST" ]; then
    echo "Sudah ada default_server di port 443 (baris di atas). Berhenti, tidak ada yang diubah."
    exit 1
  fi
fi

[ -f "$DST" ] && cp -a "$DST" "/root/0.klikumroh-default.conf.bak"
cp "$SRC" "$DST"
if ! "$NGINX" -t; then
  echo "nginx -t gagal. File baru dihapus, Nginx tidak di-reload."
  rm -f "$DST"
  exit 1
fi
"$NGINX" -s reload
sleep 1
echo "--- host asing di 443 (harus halaman KlikUmroh, bukan situs lain)"
curl -sk -H "Host: host-tidak-terdaftar.example" https://127.0.0.1/ -o /dev/null -w "%{http_code}\n"
echo "--- landing klikumroh.id (harus 200)"
curl -sk --resolve klikumroh.id:443:127.0.0.1 -o /dev/null -w "%{http_code}\n" https://klikumroh.id/
echo "--- situs lain tetap normal (aabm.or.id, harus 200 atau 30x miliknya)"
curl -sk --resolve aabm.or.id:443:127.0.0.1 -o /dev/null -w "%{http_code}\n" https://aabm.or.id/
echo "--- domain travel uji"
curl -sk -H "Host: www.crmumroh.my.id" https://127.0.0.1/ -o /dev/null -w "%{http_code}\n"
