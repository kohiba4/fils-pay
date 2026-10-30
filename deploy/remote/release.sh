#!/usr/bin/env bash
# Runs ON THE SERVER as root (via deploy.sh). Idempotent. Argument: the staging dir deploy.sh uploaded.
# Any failing step aborts the release (set -e; pipelines use pipefail).
# Order matters: files -> dependencies -> backup -> migrate -> (first time: seed) -> switch -> restart -> health -> rollback.
set -euo pipefail
STAGE=${1:?usage: release.sh <stage dir>}
REV=$(cat "$STAGE/REV")
PUBLIC_HOST=$(cat "$STAGE/PUBLIC_HOST")
REL=/opt/filspay/releases/$REV
ENVF=/etc/filspay/filspay.env
PREV=$(readlink -f /opt/filspay/current 2>/dev/null || true)

echo "== files ($REL)"
rm -rf "$REL" && mkdir -p "$REL/bin"
cp -a "$STAGE/code/." "$REL/"
install -m 0755 "$STAGE/settlement" "$REL/bin/settlement"
chown -R filspay:filspay "$REL"
rsync -a --delete "$STAGE/web/" /var/www/filspay-web/
rsync -a --delete "$STAGE/admin/" /var/www/filspay-admin/

echo "== environment (secrets are generated here, once, and never leave the server)"
if [ ! -f "$ENVF" ]; then
  DBPASS=$(cat /etc/filspay/db.pass)
  umask 027
  cat > "$ENVF" <<ENV
NODE_ENV=production
PORT=3000
DATABASE_URL=postgres://filspay:${DBPASS}@127.0.0.1:5432/filspay
PG_POOL_MAX=10
SETTLEMENT_INTERNAL_URL=http://127.0.0.1:8091
SETTLEMENT_INTERNAL_TOKEN=$(openssl rand -hex 32)
ACQUIRER_CALLBACK_SIGNING_SECRET=$(openssl rand -hex 32)
WEBHOOK_SECRET_ENCRYPTION_KEY=$(openssl rand -base64 32)
CHECKOUT_BASE_URL=https://${PUBLIC_HOST}
COOKIE_SECURE=true
SECOND_FACTOR=totp
REFUNDS_ENABLED=true
KYC_UPLOAD_DIR=/var/lib/filspay/kyc
NODE_OPTIONS=--max-old-space-size=384
ENV
  chown root:filspay "$ENVF"; chmod 640 "$ENVF"
fi
# the second factor is an authenticator app (TOTP): no code is ever returned by the API, so drop the old dev switch
sed -i '/^OTP_DEV_EXPOSE=/d' "$ENVF"
grep -q '^SECOND_FACTOR=' "$ENVF" || echo 'SECOND_FACTOR=totp' >> "$ENVF"

echo "== dependencies (only the workspaces the server runs)"
sudo -u filspay -H bash -o pipefail -c "cd '$REL' && npm ci -w apps/api -w apps/reporting -w packages/money -w packages/events --include-workspace-root --no-audit --no-fund 2>&1 | tail -3"

echo "== database backup, then migrations"
mkdir -p /var/backups/filspay
sudo -u postgres pg_dump filspay | gzip > "/var/backups/filspay/pre-$REV-$(date +%Y%m%d%H%M%S).sql.gz"
ls -1t /var/backups/filspay/*.sql.gz | tail -n +8 | xargs -r rm -f
sudo -u filspay -H bash -o pipefail -c "set -a; . '$ENVF'; set +a; cd '$REL' && npm run migrate 2>&1 | tail -3"

if [ "${SEED:-0}" = "1" ] && [ "$(sudo -u postgres psql -tAc 'SELECT count(*) FROM merchants' filspay)" = "0" ]; then
  echo "== first deploy: loading the repo's own deterministic dataset (db/seed). Keys are written to a root-only file, not printed."
  sudo -u filspay -H bash -o pipefail -c "set -a; . '$ENVF'; set +a; cd '$REL' && npm run seed" > /etc/filspay/seed-output.txt 2>&1
  chmod 600 /etc/filspay/seed-output.txt
  tail -2 /etc/filspay/seed-output.txt | sed -E 's/fp_[a-z]+_[A-Za-z0-9_-]+/<key redacted>/g'
fi

echo "== services (units, nginx), then switch the release"
install -m 0644 "$REL"/deploy/systemd/*.service /etc/systemd/system/
systemctl daemon-reload
ln -sfn "$REL" /opt/filspay/current
systemctl enable filspay-api filspay-reporting filspay-settlement >/dev/null 2>&1

# restart order: API first (health-checked), then the worker, then the settlement daemon. The daemon's unit has a long
# TimeoutStopSec and handles SIGTERM by finishing the in-flight batch (each batch is one transaction and the run is
# idempotent), so a redeploy never leaves a half-written settlement.
systemctl restart filspay-api
healthy=0
for _ in $(seq 1 40); do
  if curl -fsS -m 2 http://127.0.0.1:3000/readyz >/dev/null 2>&1; then healthy=1; break; fi
  sleep 1
done
if [ "$healthy" != 1 ]; then
  echo "!! API did not become ready; rolling back to ${PREV:-<none>}"
  journalctl -u filspay-api -n 30 --no-pager || true
  if [ -n "$PREV" ]; then ln -sfn "$PREV" /opt/filspay/current; systemctl restart filspay-api; fi
  exit 1
fi
systemctl restart filspay-reporting
systemctl restart filspay-settlement

echo "== nginx + TLS (Let's Encrypt)"
mkdir -p /var/www/certbot
CERT=/etc/letsencrypt/live/$PUBLIC_HOST/fullchain.pem
if [ ! -f "$CERT" ]; then
  sed "s/@PUBLIC_HOST@/$PUBLIC_HOST/g" "$REL/deploy/nginx/filspay-http-only.conf" > /etc/nginx/sites-available/filspay
  ln -sfn /etc/nginx/sites-available/filspay /etc/nginx/sites-enabled/filspay
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl reload nginx
  certbot certonly --webroot -w /var/www/certbot -d "$PUBLIC_HOST" --non-interactive --agree-tos --register-unsafely-without-email
  printf '#!/bin/sh\nsystemctl reload nginx\n' > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
  chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
fi
sed "s/@PUBLIC_HOST@/$PUBLIC_HOST/g" "$REL/deploy/nginx/filspay.conf" > /etc/nginx/sites-available/filspay
nginx -t
systemctl reload nginx

echo "== checks"
for _ in $(seq 1 15); do curl -fsS -m 5 "https://$PUBLIC_HOST/readyz" && break; sleep 1; done; echo
for u in filspay-api filspay-reporting filspay-settlement nginx postgresql; do systemctl is-active --quiet $u || { echo "!! $u is not active"; exit 1; }; done; echo "all services active"
ls -1dt /opt/filspay/releases/* | tail -n +5 | xargs -r rm -rf
echo "== release $REV is live"
