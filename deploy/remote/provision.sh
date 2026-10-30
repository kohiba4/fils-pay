#!/usr/bin/env bash
# Base provisioning for the FilsPay demo server (Ubuntu 24.04, 1 vCPU, 2 GB). Idempotent. Run as the `dilmune` user (sudo).
# Installs packages, Node 22 (official tarball, sha256 verified), a local-only Postgres database, a service user, and the firewall.
# Does NOT write secrets into the repo and does NOT deploy the app (that is a separate step).
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

NODE_VERSION=v22.23.4
NODE_TARBALL=node-${NODE_VERSION}-linux-x64.tar.xz
NODE_SHA256=1805bcd35e6815559bd2eb97db438d3fdb0eb3a5e6a977b7c1badca76337e9ce

echo "== apt packages"
sudo apt-get update -y
sudo apt-get install -y postgresql nginx ufw rsync xz-utils ca-certificates build-essential openssl certbot

echo "== node ${NODE_VERSION}"
if ! [ -x /opt/node/bin/node ] || ! /opt/node/bin/node -v | grep -q "^${NODE_VERSION}$"; then
  tmp=$(mktemp -d)
  curl -fsSL -o "$tmp/$NODE_TARBALL" "https://nodejs.org/dist/${NODE_VERSION}/${NODE_TARBALL}"
  echo "${NODE_SHA256}  $tmp/$NODE_TARBALL" | sha256sum -c -
  sudo rm -rf /opt/node && sudo mkdir -p /opt/node
  sudo tar -xJf "$tmp/$NODE_TARBALL" -C /opt/node --strip-components=1
  rm -rf "$tmp"
fi
for b in node npm npx; do sudo ln -sf /opt/node/bin/$b /usr/local/bin/$b; done
node -v

echo "== service user and directories"
id filspay >/dev/null 2>&1 || sudo useradd --system --home /opt/filspay --shell /usr/sbin/nologin filspay
sudo mkdir -p /opt/filspay/releases /etc/filspay /var/lib/filspay/kyc /var/log/filspay /var/www/filspay-web /var/www/filspay-admin /var/www/certbot
sudo chown -R filspay:filspay /opt/filspay /var/lib/filspay /var/log/filspay
sudo chown root:filspay /etc/filspay
sudo chmod 750 /etc/filspay

echo "== postgres (listens on localhost only by default)"
sudo systemctl enable --now postgresql
if ! sudo test -f /etc/filspay/db.pass; then
  pass=$(openssl rand -hex 24)
  printf '%s' "$pass" | sudo tee /etc/filspay/db.pass >/dev/null
  sudo chmod 600 /etc/filspay/db.pass
fi
pass=$(sudo cat /etc/filspay/db.pass)
sudo -u postgres psql -v ON_ERROR_STOP=1 -tAc "SELECT 1 FROM pg_roles WHERE rolname='filspay'" | grep -q 1 \
  || sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE ROLE filspay LOGIN PASSWORD '${pass}'"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER ROLE filspay PASSWORD '${pass}'" >/dev/null
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='filspay'" | grep -q 1 \
  || sudo -u postgres createdb -O filspay filspay
sudo -u postgres psql -tAc "SHOW listen_addresses"

echo "== firewall: ssh first, then web ports"
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 8443/tcp   # admin console (HTTPS)
sudo ufw --force enable
sudo ufw status verbose | head -12

echo "== done"
