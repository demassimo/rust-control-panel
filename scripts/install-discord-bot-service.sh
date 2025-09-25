#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME=rustadmin-discord-bot
INSTALL_DIR=${INSTALL_DIR:-/opt/rustadmin}
SERVICE_FILE=/etc/systemd/system/${SERVICE_NAME}.service
SOURCE_SERVICE="${INSTALL_DIR}/deploy/systemd/${SERVICE_NAME}.service"
USER_NAME=${USER_NAME:-rustadmin}
GROUP_NAME=${GROUP_NAME:-rustadmin}

log() {
  echo "[*] $*"
}

require_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    echo "[!] This script must be run as root" >&2
    exit 1
  fi
}

ensure_user() {
  if ! id -u "$USER_NAME" >/dev/null 2>&1; then
    echo "[!] Service user $USER_NAME does not exist. Run the main installer first." >&2
    exit 1
  fi
  if ! getent group "$GROUP_NAME" >/dev/null 2>&1; then
    echo "[!] Service group $GROUP_NAME does not exist. Run the main installer first." >&2
    exit 1
  fi
}

install_service() {
  if [ ! -f "$SOURCE_SERVICE" ]; then
    echo "[!] Service definition not found at $SOURCE_SERVICE" >&2
    exit 1
  fi

  log "Installing Discord bot systemd service"
  systemctl stop "$SERVICE_NAME" 2>/dev/null || true
  install -m 644 "$SOURCE_SERVICE" "$SERVICE_FILE"
  systemctl daemon-reload
  systemctl enable --now "$SERVICE_NAME"
}

main() {
  require_root
  ensure_user
  install_service
  log "Discord bot service installed"
}

main "$@"
