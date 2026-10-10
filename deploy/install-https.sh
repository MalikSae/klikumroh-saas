#!/bin/bash
# Installs the Cloudflare origin certificate and the KlikUmroh nginx vhost on the shared aaPanel server.
# Run as root from the repo root: bash deploy/install-https.sh
# Needs /www/server/panel/vhost/cert/klikumroh.id/origin.key (created with the CSR step, never in git).
set -e
D=/www/server/panel/vhost/cert/klikumroh.id
V=/www/server/panel/vhost/nginx/klikumroh.id.conf
NGINX=/www/server/nginx/sbin/nginx
cp deploy/origin.pem "$D/origin.pem"
chmod 644 "$D/origin.pem"
A=$(openssl x509 -in "$D/origin.pem" -noout -modulus | md5sum)
B=$(openssl rsa -in "$D/origin.key" -noout -modulus | md5sum)
[ "$A" = "$B" ] || { echo "Kunci privat tidak cocok dengan sertifikat, berhenti."; exit 1; }
echo "Kunci cocok."
[ -f "$V" ] && cp -a "$V" "/root/klikumroh.id.conf.bak"
cp deploy/nginx-klikumroh.conf "$V"
"$NGINX" -t && "$NGINX" -s reload && sleep 1
echo "--- https landing";   curl -sk -o /dev/null -w "%{http_code}\n" --resolve klikumroh.id:443:127.0.0.1 https://klikumroh.id/
echo "--- https dashboard"; curl -sk -o /dev/null -w "%{http_code}\n" --resolve app.klikumroh.id:443:127.0.0.1 https://app.klikumroh.id/
echo "--- situs lain";      curl -s -o /dev/null -w "%{http_code}\n" -H "Host: ontaf.id" http://127.0.0.1/
