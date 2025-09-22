#!/usr/bin/env bash
set -euo pipefail

USER_NAME=rustadmin
INSTALL_DIR=/opt/rustadmin
SERVICE_FILE=/etc/systemd/system/rustadmin-backend.service
NGINX_SITE=/etc/nginx/sites-available/rustadmin.conf
NGINX_LINK=/etc/nginx/sites-enabled/rustadmin.conf

PURGE=0
if [ "${1-}" = "--purge" ]; then
  PURGE=1
fi

echo "[*] Stopping and disabling service"
systemctl stop rustadmin-backend 2>/dev/null || true
systemctl disable rustadmin-backend 2>/dev/null || true

if [ -f "$SERVICE_FILE" ]; then
  rm -f "$SERVICE_FILE"
  systemctl daemon-reload
fi

echo "[*] Removing nginx site link"
rm -f "$NGINX_LINK"
if [ -f "$NGINX_SITE" ]; then
  rm -f "$NGINX_SITE"
fi
nginx -t && systemctl reload nginx || true

if [ "$PURGE" -eq 1 ]; then
  echo "[*] Purging install directory: $INSTALL_DIR"
  rm -rf "$INSTALL_DIR"
  echo "[*] Removing user: $USER_NAME"
  userdel -r "$USER_NAME" 2>/dev/null || true
else
  echo "[*] Kept data in $INSTALL_DIR (use --purge to remove)"
fi

echo "[*] Uninstall complete."
