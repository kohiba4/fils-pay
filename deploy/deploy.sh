#!/usr/bin/env bash
# THE redeploy command (run from the repo root on a workstation):   ./deploy/deploy.sh
#
# Builds everything locally (web, admin, the Go settlement binary), uploads one staged release over ssh (no git
# credentials ever live on the server), then runs deploy/remote/release.sh there as root. The remote step installs
# dependencies, takes a database backup, applies migrations, switches the `current` symlink, restarts the services in a
# safe order and health-checks them; on a failed health check it rolls the symlink back to the previous release.
#
# First time on a new server:  ssh <host> 'bash -s' < deploy/remote/provision.sh   (installs packages, Postgres, firewall)
# First deploy only: SEED=1 ./deploy/deploy.sh loads the repo's own dataset (db/seed) when the database has no merchants.
# Config:  DEPLOY_HOST, DEPLOY_KEY, PUBLIC_HOST (defaults below).  Secrets: generated ON the server in /etc/filspay/filspay.env.
set -euo pipefail
cd "$(dirname "$0")/.."

DEPLOY_HOST=${DEPLOY_HOST:-dilmune@157.245.105.203}
DEPLOY_KEY=${DEPLOY_KEY:-$HOME/.ssh/dilmune_ed25519}
PUBLIC_HOST=${PUBLIC_HOST:-157-245-105-203.sslip.io}
SSH=(ssh -i "$DEPLOY_KEY" -o IdentitiesOnly=yes -o BatchMode=yes "$DEPLOY_HOST")

[ -z "$(git status --porcelain)" ] || { echo "refusing to deploy a dirty tree (commit first): the release id is the commit"; exit 1; }
REV=$(git rev-parse --short HEAD)
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
echo "== release $REV -> $DEPLOY_HOST ($PUBLIC_HOST)"

echo "== build: web, admin (same-origin API, so VITE_*_API_BASE_URL is empty)"
( cd apps/web   && VITE_API_BASE_URL= npm run build >/dev/null )
( cd apps/admin && VITE_ADMIN_API_BASE_URL= VITE_WEB_BASE_URL="https://$PUBLIC_HOST" npm run build >/dev/null )
echo "== build: settlement (static linux/amd64 binary, no Go needed on the server)"
( cd apps/settlement && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -o "$STAGE/settlement" ./cmd/settlement )

mkdir -p "$STAGE/code"
git archive HEAD | tar -x -C "$STAGE/code"
cp -r apps/web/dist "$STAGE/web"
cp -r apps/admin/dist "$STAGE/admin"
echo "$PUBLIC_HOST" > "$STAGE/PUBLIC_HOST"
echo "$REV" > "$STAGE/REV"

echo "== upload"
"${SSH[@]}" 'rm -rf /tmp/filspay-stage && mkdir -p /tmp/filspay-stage'
tar -C "$STAGE" -czf - . | "${SSH[@]}" 'tar -xzf - -C /tmp/filspay-stage'

echo "== release (remote)"
"${SSH[@]}" "sudo SEED=${SEED:-0} bash /tmp/filspay-stage/code/deploy/remote/release.sh /tmp/filspay-stage"
echo "== deployed $REV: https://$PUBLIC_HOST  (admin: https://$PUBLIC_HOST:8443)"
