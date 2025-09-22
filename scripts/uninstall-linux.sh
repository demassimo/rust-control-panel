#!/usr/bin/env bash
set -euo pipefail

USER_NAME=rustadmin
INSTALL_DIR=/opt/rustadmin
SERVICE_FILE=/etc/systemd/system/rustadmin-backend.service
NGINX_SITE=/etc/nginx/sites-available/rustadmin.conf
NGINX_LINK=/etc/nginx/sites-enabled/rustadmin.conf

prompt_confirm() {
  local prompt="$1"
  local default="$2"
  local response=""
  local default_lower="${default,,}"
  local default_hint="y/N"

  if [[ "$default_lower" == "y" ]]; then
    default_hint="Y/n"
  fi

  if [ -t 0 ]; then
    read -rp "$prompt [$default_hint]: " response || true
  fi

  response="${response:-$default}"

  case "${response,,}" in
    y|yes) return 0 ;;
    *) return 1 ;;
  esac
}

PURGE=0
case "${1-}" in
  --purge)
    PURGE=1
    ;;
  --keep-data)
    PURGE=0
    ;;
  "")
    if prompt_confirm "Remove application data in $INSTALL_DIR and delete user $USER_NAME?" "n"; then
      PURGE=1
    else
      PURGE=0
    fi
    ;;
  *)
    echo "[!] Unknown option: $1" >&2
    echo "Usage: $0 [--purge|--keep-data]" >&2
    exit 1
    ;;
esac

echo "[*] Stopping and disabling service"
if command -v systemctl >/dev/null 2>&1; then
  systemctl stop rustadmin-backend 2>/dev/null || true
  systemctl disable rustadmin-backend 2>/dev/null || true
else
  echo "    systemctl not available, skipping"
fi

if [ -f "$SERVICE_FILE" ]; then
  rm -f "$SERVICE_FILE"
  if command -v systemctl >/dev/null 2>&1; then
    systemctl daemon-reload
  fi
fi

echo "[*] Removing nginx site link"
rm -f "$NGINX_LINK"
if [ -f "$NGINX_SITE" ]; then
  rm -f "$NGINX_SITE"
fi
if command -v nginx >/dev/null 2>&1; then
  if nginx -t >/dev/null 2>&1; then
    if command -v systemctl >/dev/null 2>&1; then
      systemctl reload nginx || true
    else
      echo "    systemctl not available to reload nginx"
    fi
  else
    echo "    nginx config test failed; not reloading"
  fi
fi

if [ "$PURGE" -eq 1 ]; then
  echo "[*] Purging install directory: $INSTALL_DIR"
  rm -rf "$INSTALL_DIR"
  echo "[*] Removing user: $USER_NAME"
  userdel -r "$USER_NAME" 2>/dev/null || true
else
  echo "[*] Kept data in $INSTALL_DIR (use --purge to remove)"
fi

echo "[*] Uninstall complete."
