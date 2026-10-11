#!/bin/bash
# Read-only security audit of the KlikUmroh deployment on the shared aaPanel server.
# Run as root: bash /www/wwwroot/klikumroh/deploy/security-audit.sh
# Changes NOTHING and prints no secret value: only OK / WARN / FAIL lines. Paste the output to review it.
APP=/www/wwwroot/klikumroh
NGINX=/www/server/nginx/sbin/nginx
ok()   { echo "OK    $*"; }
warn() { echo "WARN  $*"; }
fail() { echo "FAIL  $*"; }
sec()  { echo; echo "== $* =="; }
perm() { stat -c '%a %U:%G' "$1" 2>/dev/null; }

sec "1. Port yang mendengar (hanya 22/80/443 yang boleh publik)"
ss -tlnH 2>/dev/null | awk '{print $4}' | sed 's/.*://' | sort -un | while read -r p; do
  addrs=$(ss -tlnH | awk -v p=":$p" '$4 ~ p"$" {print $4}' | sed "s/:$p\$//" | sort -u | tr '\n' ' ')
  case "$addrs" in *"0.0.0.0"*|*"*"*|*"[::]"*) pub=1 ;; *) pub=0 ;; esac
  if [ "$pub" = 1 ]; then
    case "$p" in 22|80|443) ok "port $p publik (wajar)";; *) warn "port $p terbuka ke semua interface ($addrs)";; esac
  fi
done
for p in 18080 13000 3306; do
  a=$(ss -tlnH | awk -v p=":$p" '$4 ~ p"$" {print $4}' | head -1)
  case "$a" in
    "") echo "INFO  port $p tidak mendengar" ;;
    127.0.0.1:*|"[::1]:"*) ok "port $p hanya localhost ($a)" ;;
    *) fail "port $p mendengar di $a (harus 127.0.0.1)" ;;
  esac
done

sec "2. Berkas rahasia dan izin"
for f in "$APP/.env" /www/server/panel/vhost/cert/klikumroh.id/origin.key /root/.klikumroh-demo.env; do
  [ -e "$f" ] || { echo "INFO  $f tidak ada"; continue; }
  m=$(stat -c '%a' "$f")
  if [ $((8#$m & 8#007)) -ne 0 ]; then fail "$f dapat dibaca semua pengguna ($(perm "$f"))"; else ok "$f $(perm "$f")"; fi
done
b=/www/backup/klikumroh
if [ -d "$b" ]; then
  m=$(stat -c '%a' "$b"); [ "$m" = "700" ] && ok "$b $m" || warn "$b izin $m (disarankan 700)"
  n=$(find "$b" -type f -perm /077 | wc -l); [ "$n" = 0 ] && ok "semua backup 600" || fail "$n backup terbaca grup/lainnya"
else echo "INFO  $b belum ada (backup.sh belum pernah jalan?)"; fi
[ -d "$APP/.git" ] && ok ".git ada (harus tidak terjangkau web, dicek di bagian 3)"

sec "3. Berkas sensitif tidak terjangkau dari web (lewat Nginx lokal)"
for h in klikumroh.id app.klikumroh.id demo.klikumroh.id; do
  for p in /.env /.git/config /deploy/security-audit.sh /bin/klikumroh-api /migrations/ /internal/ /uploads/../.env; do
    c=$(curl -sk --max-time 8 --resolve "$h:443:127.0.0.1" -o /dev/null -w '%{http_code}' "https://$h$p")
    body=$(curl -sk --max-time 8 --resolve "$h:443:127.0.0.1" "https://$h$p" | head -c 4000)
    if [ "$c" = 200 ] && echo "$body" | grep -qiE 'DB_PASSWORD|\[core\]|repositoryformatversion|ELF|CREATE TABLE'; then
      fail "https://$h$p terbaca ($c)"
    else ok "$h$p -> $c"; fi
  done
done
n=$(find "$APP/dashboard/dist" -name '*.map' 2>/dev/null | wc -l)
[ "$n" = 0 ] && ok "dashboard/dist tanpa sourcemap" || warn "$n berkas .map di dashboard/dist (membuka kode sumber)"
c=$(curl -sk --max-time 8 --resolve app.klikumroh.id:443:127.0.0.1 -o /dev/null -w '%{http_code}' https://app.klikumroh.id/assets/)
[ "$c" = 200 ] && warn "daftar direktori /assets/ mungkin terbuka" || ok "/assets/ -> $c"

sec "4. Header keamanan respons"
h=$(curl -skI --max-time 8 --resolve klikumroh.id:443:127.0.0.1 https://klikumroh.id/ | tr -d '\r')
for k in strict-transport-security x-content-type-options x-frame-options referrer-policy; do
  echo "$h" | grep -qi "^$k:" && ok "klikumroh.id kirim $k" || warn "klikumroh.id tanpa header $k"
done
echo "$h" | grep -qi '^server: .*[0-9]' && warn "header Server membuka versi" || ok "header Server tanpa versi"
echo "$h" | grep -qi '^x-powered-by' && warn "header X-Powered-By aktif" || ok "tanpa X-Powered-By"

sec "5. Penanganan host asing dan isolasi tenant"
c=$(curl -sk --max-time 8 -H "Host: host-tidak-terdaftar.example" -o /dev/null -w '%{http_code}' https://127.0.0.1/)
[ "$c" = 404 ] && ok "host asing di 443 -> 404 (KlikUmroh)" || warn "host asing di 443 -> $c (harus 404; install-default-host.sh sudah dijalankan?)"
c=$(curl -s --max-time 8 -H "X-Forwarded-Host: host-tidak-terdaftar.example" -o /dev/null -w '%{http_code}' http://127.0.0.1:18080/api/public/packages)
[ "$c" = 404 ] || [ "$c" = 400 ] && ok "API menolak host tidak terdaftar ($c)" || warn "API host tidak terdaftar -> $c"
for p in /api/admin/prospects /api/agent/me /api/staff/tenants; do
  c=$(curl -s --max-time 8 -o /dev/null -w '%{http_code}' "http://127.0.0.1:18080$p")
  case "$c" in 401|403|404) ok "$p tanpa token -> $c";; *) fail "$p tanpa token -> $c (harus 401/403)";; esac
done

sec "6. Layanan dan proses"
for u in klikumroh-api klikumroh-web; do
  usr=$(systemctl show -p User --value "$u" 2>/dev/null)
  [ -z "$usr" ] && warn "$u: User kosong (jalan sebagai root?)" || { [ "$usr" = root ] && fail "$u jalan sebagai root" || ok "$u jalan sebagai $usr"; }
  systemctl is-active --quiet "$u" && ok "$u aktif" || warn "$u tidak aktif"
done
grep -q 'NoNewPrivileges=true' /etc/systemd/system/klikumroh-api.service 2>/dev/null && ok "klikumroh-api NoNewPrivileges" || warn "klikumroh-api tanpa NoNewPrivileges"
for u in ProtectSystem ProtectHome PrivateTmp; do
  grep -q "^$u=" /etc/systemd/system/klikumroh-api.service 2>/dev/null || warn "klikumroh-api tanpa $u= (hardening tambahan, opsional)"
done
[ "$(perm "$APP/bin/klikumroh-api" | cut -d' ' -f1)" -le 755 ] 2>/dev/null && ok "bin/klikumroh-api $(perm "$APP/bin/klikumroh-api")"
w=$(find "$APP/bin" "$APP/deploy" -type f -perm -o+w 2>/dev/null | wc -l)
[ "$w" = 0 ] && ok "bin/ dan deploy/ tidak dapat ditulis semua pengguna" || fail "$w berkas bin/deploy dapat ditulis semua pengguna"

sec "7. Database"
if command -v mysql >/dev/null; then
  mysql -N -e "select user,host from mysql.user where host not in ('localhost','127.0.0.1','::1')" 2>/dev/null | grep -q . \
    && warn "ada akun MySQL yang boleh login dari host jauh (periksa mysql.user)" || ok "akun MySQL hanya localhost"
  mysql -N -e "select user,host from mysql.user where authentication_string='' or password=''" 2>/dev/null | grep -q . \
    && fail "ada akun MySQL tanpa kata sandi" || ok "tidak ada akun MySQL tanpa kata sandi"
else echo "INFO  klien mysql tidak ada di PATH, bagian ini dilewati"; fi

sec "8. SSH, firewall, brute force"
sshd=$(sshd -T 2>/dev/null)
echo "$sshd" | grep -qi '^permitrootlogin yes' && warn "SSH PermitRootLogin yes (pakai kunci: prohibit-password)" || ok "SSH root login tidak dengan kata sandi"
echo "$sshd" | grep -qi '^passwordauthentication yes' && warn "SSH PasswordAuthentication yes (matikan bila sudah pakai kunci)" || ok "SSH tanpa kata sandi"
if command -v ufw >/dev/null && ufw status | grep -q active; then ok "ufw aktif"
elif iptables -S 2>/dev/null | grep -q -- '-P INPUT DROP'; then ok "iptables INPUT default DROP"
else warn "tidak terdeteksi firewall aktif (ufw/iptables); cek firewall aaPanel atau penyedia VPS"; fi
systemctl is-active --quiet fail2ban && ok "fail2ban aktif" || warn "fail2ban tidak aktif"
ss -tlnH | grep -q ':8888 ' && warn "panel aaPanel di port 8888 terbuka; batasi per IP atau pakai jalur masuk aman" || true

sec "9. Pembaruan OS dan Nginx"
if command -v apt-get >/dev/null; then
  n=$(apt-get -s upgrade 2>/dev/null | grep -c '^Inst.*security')
  [ "$n" = 0 ] && ok "tidak ada pembaruan keamanan tertunda" || warn "$n paket punya pembaruan keamanan tertunda (apt upgrade)"
fi
[ -f /var/run/reboot-required ] && warn "server butuh reboot (kernel/pustaka diperbarui)" || ok "tidak butuh reboot"
"$NGINX" -t >/dev/null 2>&1 && ok "nginx -t lulus" || fail "nginx -t gagal"
"$NGINX" -T 2>/dev/null | grep -q 'server_tokens off' && ok "server_tokens off" || warn "server_tokens belum off (versi Nginx terbuka)"

sec "10. Asal lalu lintas"
echo "INFO  Pastikan firewall hanya menerima 80/443 dari rentang IP Cloudflare (cloudflare.com/ips) agar IP asli server"
echo "INFO  tidak bisa dipakai menembus Cloudflare/WAF. Uji dari luar: curl -k https://IP_SERVER -H 'Host: klikumroh.id'."
echo
echo "Selesai. Tidak ada yang diubah."
