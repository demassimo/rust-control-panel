#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/demassimo/rust-control-panel"
INSTALL_DIR="/opt/rustadmin"
SERVICE_NAME="rustadmin-backend"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
DISCORD_SERVICE_NAME="rustadmin-discord-bot"
DISCORD_SERVICE_FILE="/etc/systemd/system/${DISCORD_SERVICE_NAME}.service"
USER_NAME="rustadmin"
GROUP_NAME="rustadmin"
NGINX_SITE="/etc/nginx/sites-available/rustadmin.conf"
NGINX_LINK="/etc/nginx/sites-enabled/rustadmin.conf"
NGINX_SSL_DIR="/etc/nginx/ssl"

prompt_with_default() {
  local prompt="$1"
  local default="$2"
  local response=""
  if [ -t 0 ]; then
    read -r -p "$prompt [$default]: " response || response=""
  fi
  if [ -z "$response" ]; then
    response="$default"
  fi
  echo "$response"
}

log() {
  echo "[*] $*"
}

warn() {
  echo "[!] $*" >&2
}

require_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    echo "[!] This updater must be run as root (try: sudo bash scripts/update-linux.sh)" >&2
    exit 1
  fi
}

ensure_packages() {
  local packages=("$@")
  local missing=()
  for pkg in "${packages[@]}"; do
    if ! dpkg -s "$pkg" >/dev/null 2>&1; then
      missing+=("$pkg")
    fi
  done
  if ((${#missing[@]})); then
    log "Installing packages: ${missing[*]}"
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y "${missing[@]}"
  fi
}

ensure_command() {
  local cmd="$1"
  local pkg="$2"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    ensure_packages "$pkg"
  fi
}

ensure_tls_certificate() {
  local backend_env="$INSTALL_DIR/backend/.env"
  local panel_public_url panel_host san_target cert_file key_file needs_cert default_host

  if [ -f "$backend_env" ]; then
    panel_public_url="$(awk -F '=' '/^PANEL_PUBLIC_URL=/{print $2}' "$backend_env" | tail -n1 | tr -d '[:space:]')"
  else
    panel_public_url=""
  fi

  panel_host="$(printf '%s' "${panel_public_url:-}" | sed -E 's#^[a-zA-Z]+://##' | cut -d/ -f1 | cut -d: -f1)"
  cert_file="$NGINX_SSL_DIR/rustadmin.crt"
  key_file="$NGINX_SSL_DIR/rustadmin.key"

  needs_cert="false"
  if [[ ! -f "$cert_file" || ! -f "$key_file" ]]; then
    needs_cert="true"
  fi

  if [[ "$needs_cert" == "false" ]]; then
    log "Using existing TLS certificate at $cert_file"
    return
  fi

  default_host="$(hostname -f 2>/dev/null || echo localhost)"
  if [[ -z "$panel_host" && -t 0 ]]; then
    panel_host="$(prompt_with_default "Hostname for self-signed TLS certificate" "$default_host")"
  fi

  if [[ -z "$panel_host" ]]; then
    panel_host="$default_host"
  fi

  if [[ "$panel_host" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    san_target="IP:${panel_host}"
  else
    san_target="DNS:${panel_host}"
  fi

  ensure_packages openssl
  mkdir -p "$NGINX_SSL_DIR"
  log "Generating self-signed TLS certificate for $panel_host"
  openssl req -x509 -nodes -newkey rsa:4096 -days 825 \
    -keyout "$key_file" -out "$cert_file" \
    -subj "/CN=${panel_host}" -addext "subjectAltName=${san_target}"
  chmod 600 "$key_file"
  chmod 644 "$cert_file"
}

clone_latest() {
  TMP_DIR="$(mktemp -d)"
  trap 'rm -rf "${TMP_DIR:-}"' EXIT
  log "Fetching latest sources from $REPO_URL"
  git clone --depth=1 "$REPO_URL" "$TMP_DIR/src"
  CLONE_DIR="$TMP_DIR/src"
}

sync_sources() {
  log "Synchronising files to $INSTALL_DIR"
  ensure_command rsync rsync
  rsync -a --delete \
    --exclude '.git/' \
    --exclude 'scripts/' \
    --exclude 'README-linux.md' \
    --exclude 'backend/.env' \
    --exclude 'backend/data/' \
    --exclude 'backend/node_modules/' \
    "$CLONE_DIR/" "$INSTALL_DIR/"
}

update_backend() {
  if [ ! -d "$INSTALL_DIR/backend" ]; then
    warn "Backend directory missing at $INSTALL_DIR/backend"
    return
  fi
  log "Installing backend dependencies"
  (cd "$INSTALL_DIR/backend" && npm install --omit=dev --no-audit --no-fund --progress=false)
  mkdir -p "$INSTALL_DIR/backend/data"
}

run_backend_migrations() {
  if [ ! -f "$INSTALL_DIR/backend/.env" ]; then
    warn "Backend .env missing at $INSTALL_DIR/backend/.env; skipping database migration"
    return
  fi
  log "Running database migrations"
  (cd "$INSTALL_DIR/backend" && npm run migrate --silent)
}

update_backend_service() {
  local source_service="$INSTALL_DIR/deploy/systemd/${SERVICE_NAME}.service"
  if [ ! -f "$source_service" ]; then
    warn "Service definition not found at $source_service"
    return
  fi
  log "Updating systemd service"
  systemctl stop "$SERVICE_NAME" 2>/dev/null || true
  install -m 644 "$source_service" "$SERVICE_FILE"
  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME" >/dev/null 2>&1 || true
}

install_or_update_discord_service() {
  local source_service="$INSTALL_DIR/deploy/systemd/${DISCORD_SERVICE_NAME}.service"
  if [ ! -f "$source_service" ]; then
    warn "Discord bot service definition not found at $source_service"
    return
  fi

  local installer_script="$CLONE_DIR/scripts/install-discord-bot-service.sh"
  if [ ! -x "$installer_script" ]; then
    warn "Discord bot installer script missing at $installer_script"
    return
  fi

  log "Installing/updating Discord bot service"
  INSTALL_DIR="$INSTALL_DIR" USER_NAME="$USER_NAME" GROUP_NAME="$GROUP_NAME" bash "$installer_script"
}

backend_port_from_env() {
  local backend_env="$INSTALL_DIR/backend/.env"
  local backend_port=""
  if [ -f "$backend_env" ]; then
    backend_port="$(awk -F '=' '/^PORT=/{print $2}' "$backend_env" | tail -n1 | tr -d '[:space:]')"
  fi
  if [[ -z "$backend_port" || ! "$backend_port" =~ ^[0-9]+$ ]]; then
    backend_port="8787"
  fi
  echo "$backend_port"
}

update_nginx() {
  local nginx_template="$INSTALL_DIR/deploy/nginx/rustadmin.conf"
  if [ ! -f "$nginx_template" ]; then
    warn "nginx template not found at $nginx_template"
    return
  fi
  log "Refreshing nginx configuration"
  local backend_port
  backend_port="$(backend_port_from_env)"
  local tmp_conf
  tmp_conf="$(mktemp)"
  sed "s/__BACKEND_PORT__/$backend_port/g" "$nginx_template" >"$tmp_conf"
  ensure_tls_certificate
  install -m 644 "$tmp_conf" "$NGINX_SITE"
  rm -f "$tmp_conf"
  ln -sf "$NGINX_SITE" "$NGINX_LINK"
  if nginx -t; then
    systemctl reload nginx
  else
    warn "nginx test failed; configuration not reloaded"
  fi
}

confirm_nginx_update() {
  if [ ! -t 0 ]; then
    warn "Non-interactive shell detected; skipping nginx configuration update"
    return 1
  fi

  local response=""
  read -r -p "Do you want to update the nginx configuration? [y/N]: " response || response=""

  case "$response" in
    [yY]|[yY][eE][sS])
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

restart_services() {
  log "Restarting services"
  systemctl restart "$SERVICE_NAME"
  if systemctl list-unit-files | awk '{print $1}' | grep -qx "$DISCORD_SERVICE_NAME"; then
    systemctl restart "$DISCORD_SERVICE_NAME" 2>/dev/null || true
  elif [ -f "$DISCORD_SERVICE_FILE" ]; then
    systemctl restart "$DISCORD_SERVICE_NAME" 2>/dev/null || true
  fi
}

main() {
  require_root

  if [ ! -d "$INSTALL_DIR" ]; then
    echo "[!] Install directory $INSTALL_DIR not found. Run the installer first." >&2
    exit 1
  fi

  ensure_command git git
  ensure_command npm nodejs

  clone_latest
  sync_sources
  update_backend
  run_backend_migrations
  update_backend_service
  install_or_update_discord_service
  if confirm_nginx_update; then
    update_nginx
  else
    log "Skipping nginx configuration update"
  fi
  restart_services
  log "Update complete"
}

main "$@"
