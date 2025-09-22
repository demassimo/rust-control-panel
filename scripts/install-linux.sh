#!/usr/bin/env bash
set -euo pipefail

USER_NAME=rustadmin
INSTALL_DIR=/opt/rustadmin
SERVICE_FILE=/etc/systemd/system/rustadmin-backend.service
NGINX_SITE=/etc/nginx/sites-available/rustadmin.conf
NGINX_LINK=/etc/nginx/sites-enabled/rustadmin.conf

echo "[*] Installing prerequisites (Node.js 20 + nginx)"
if ! command -v node >/dev/null 2>&1; then
  apt-get update
  apt-get install -y curl ca-certificates gnupg
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
if ! command -v nginx >/dev/null 2>&1; then
  apt-get update && apt-get install -y nginx
fi

echo "[*] Creating user and directories"
id -u $USER_NAME &>/dev/null || useradd -r -m -d $INSTALL_DIR -s /usr/sbin/nologin $USER_NAME
mkdir -p $INSTALL_DIR
# Expect the tar.gz to have been extracted already if running from repo root; otherwise try to detect.
if [ -f "docker-compose.yml" ] && [ -d "backend" ]; then
  SRC_DIR="$(pwd)"
else
  # If running from compressed artifact, assume it's in current dir name rustadmin-open-linux/
  SRC_DIR="$(pwd)"
fi

echo "[*] Copying files to $INSTALL_DIR"
rsync -a --delete "$SRC_DIR/" "$INSTALL_DIR/"
chown -R $USER_NAME:$USER_NAME "$INSTALL_DIR"

echo "[*] Backend dependencies"
cd "$INSTALL_DIR/backend"
cp -n .env.example .env || true
npm install --omit=dev

echo "[*] Installing systemd service"
cp "$INSTALL_DIR/deploy/systemd/rustadmin-backend.service" "$SERVICE_FILE"
systemctl daemon-reload
systemctl enable rustadmin-backend
systemctl restart rustadmin-backend

echo "[*] Configuring nginx (serving frontend)"
cp "$INSTALL_DIR/deploy/nginx/rustadmin.conf" "$NGINX_SITE"
ln -sf "$NGINX_SITE" "$NGINX_LINK"
nginx -t && systemctl reload nginx

echo "[*] Done. API on :8787, UI on :80"
