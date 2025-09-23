#!/usr/bin/env bash
set -euo pipefail

USER_NAME=rustadmin
GROUP_NAME=rustadmin
INSTALL_DIR=/opt/rustadmin
SERVICE_NAME=rustadmin-backend
SERVICE_FILE=/etc/systemd/system/${SERVICE_NAME}.service
NGINX_SITE=/etc/nginx/sites-available/rustadmin.conf
NGINX_LINK=/etc/nginx/sites-enabled/rustadmin.conf
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR=""

log() {
  echo "[*] $*"
}

require_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    echo "[!] This installer must be run as root (try: sudo bash scripts/install-linux.sh)" >&2
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

install_node() {
  if ! command -v node >/dev/null 2>&1; then
    log "Installing Node.js 20 (NodeSource)"
    ensure_packages curl ca-certificates gnupg lsb-release
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
  fi
}

install_nginx() {
  if ! command -v nginx >/dev/null 2>&1; then
    log "Installing nginx"
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y nginx
    systemctl enable --now nginx
  else
    systemctl enable --now nginx >/dev/null 2>&1 || true
  fi
}

prompt_with_default() {
  local prompt="$1"
  local default="$2"
  local response=""
  if [ -t 0 ]; then
    read -rp "$prompt [$default]: " response || true
  fi
  if [ -z "${response}" ]; then
    echo "$default"
  else
    echo "$response"
  fi
}

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

generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
    return
  fi
  if command -v python3 >/dev/null 2>&1; then
    python3 - <<'PY'
import secrets
print(secrets.token_hex(32))
PY
    return
  fi
  tr -dc 'A-Za-z0-9' </dev/urandom | head -c 64
}

detect_source() {
  local candidate

  candidate="$(cd "$SCRIPT_DIR/.." && pwd)"
  if [ -f "$candidate/docker-compose.yml" ] && [ -d "$candidate/backend" ] && \
     [ -f "$candidate/backend/package.json" ] && [ -d "$candidate/frontend" ]; then
    SRC_DIR="$candidate"
    return
  fi

  candidate="$(pwd)"
  if [ -f "$candidate/docker-compose.yml" ] && [ -d "$candidate/backend" ] && \
     [ -f "$candidate/backend/package.json" ] && [ -d "$candidate/frontend" ]; then
    SRC_DIR="$candidate"
    return
  fi

  echo "[!] Unable to locate project root. Run this script from the extracted rust-control-panel directory." >&2
  exit 1
}

prepare_user() {
  mkdir -p "$INSTALL_DIR"
  if ! getent group "$GROUP_NAME" >/dev/null 2>&1; then
    log "Creating service group $GROUP_NAME"
    groupadd -r "$GROUP_NAME"
  fi
  if ! id -u "$USER_NAME" >/dev/null 2>&1; then
    log "Creating service user $USER_NAME"
    useradd -r -m -d "$INSTALL_DIR" -s /usr/sbin/nologin -g "$GROUP_NAME" "$USER_NAME"
  else
    usermod -d "$INSTALL_DIR" -s /usr/sbin/nologin -g "$GROUP_NAME" "$USER_NAME"
  fi
}

copy_sources() {
  log "Copying application files to $INSTALL_DIR"
  ensure_command rsync rsync
  rsync -a --delete \
    --exclude '.git/' \
    --exclude 'scripts/' \
    --exclude 'README-linux.md' \
    --exclude 'backend/.env' \
    --exclude 'backend/data/' \
    --exclude 'backend/node_modules/' \
    "$SRC_DIR/" "$INSTALL_DIR/"
}

setup_backend() {
  log "Preparing backend"
  cd "$INSTALL_DIR/backend"
  npm install --omit=dev --no-audit --no-fund --progress=false
  mkdir -p data
}

configure_backend_env() {
  log "Configuring backend environment"
  local env_file="$INSTALL_DIR/backend/.env"
  if [ -f "$env_file" ]; then
    if ! prompt_confirm "A backend .env already exists. Overwrite?" "n"; then
      log "Keeping existing .env"
      return
    fi
  fi

  local db_client
  while true; do
    db_client="$(prompt_with_default "Database client (sqlite/mysql)" "sqlite")"
    db_client="${db_client,,}"
    if [[ "$db_client" == "sqlite" || "$db_client" == "mysql" ]]; then
      break
    fi
    echo "Please enter either 'sqlite' or 'mysql'."
  done

  local sqlite_file="./data/panel.sqlite"
  local mysql_host="127.0.0.1"
  local mysql_port="3306"
  local mysql_user="rustadmin"
  local mysql_password=""
  local mysql_database="rustadmin"

  if [[ "$db_client" == "sqlite" ]]; then
    sqlite_file="$(prompt_with_default "SQLite file path" "$sqlite_file")"
  else
    mysql_host="$(prompt_with_default "MySQL host" "$mysql_host")"
    mysql_port="$(prompt_with_default "MySQL port" "$mysql_port")"
    mysql_user="$(prompt_with_default "MySQL user" "$mysql_user")"
    mysql_password="$(prompt_with_default "MySQL password" "$mysql_password")"
    mysql_database="$(prompt_with_default "MySQL database" "$mysql_database")"
  fi

  local bind_addr
  bind_addr="$(prompt_with_default "API bind address" "0.0.0.0")"
  local api_port
  api_port="$(prompt_with_default "API port" "8787")"
  local cors_origin
  cors_origin="$(prompt_with_default "Allowed frontend origins (comma separated, * for any)" "*")"

  local default_secret
  default_secret="$(generate_secret)"
  local jwt_secret
  jwt_secret="$(prompt_with_default "JWT secret" "$default_secret")"

  local steam_api_key
  steam_api_key="$(prompt_with_default "Steam API key (leave blank to disable sync)" "")"

  {
    printf 'DB_CLIENT=%s\n' "$db_client"
    if [[ "$db_client" == "sqlite" ]]; then
      printf 'SQLITE_FILE=%s\n' "$sqlite_file"
    else
      printf 'MYSQL_HOST=%s\n' "$mysql_host"
      printf 'MYSQL_PORT=%s\n' "$mysql_port"
      printf 'MYSQL_USER=%s\n' "$mysql_user"
      printf 'MYSQL_PASSWORD=%s\n' "$mysql_password"
      printf 'MYSQL_DATABASE=%s\n' "$mysql_database"
    fi
    printf 'BIND=%s\n' "$bind_addr"
    printf 'PORT=%s\n' "$api_port"
    if [[ -n "$cors_origin" ]]; then
      printf 'CORS_ORIGIN=%s\n' "$cors_origin"
    fi
    printf 'JWT_SECRET=%s\n' "$jwt_secret"
    if [[ -n "$steam_api_key" ]]; then
      printf 'STEAM_API_KEY=%s\n' "$steam_api_key"
    fi
  } >"$env_file"
}

install_service() {
  log "Installing systemd service"
  systemctl stop "$SERVICE_NAME" 2>/dev/null || true
  install -m 644 "$INSTALL_DIR/deploy/systemd/${SERVICE_NAME}.service" "$SERVICE_FILE"
  systemctl daemon-reload
  systemctl enable --now "$SERVICE_NAME"
}

configure_nginx() {
  log "Configuring nginx"
  mkdir -p "$(dirname "$NGINX_SITE")" "$(dirname "$NGINX_LINK")"
  local default_site_link
  default_site_link="$(dirname "$NGINX_LINK")/default"
  if [ -L "$default_site_link" ]; then
    log "Disabling default nginx site"
    rm -f "$default_site_link"
  fi
  local backend_env backend_port tmp_conf
  backend_env="$INSTALL_DIR/backend/.env"
  if [ -f "$backend_env" ]; then
    backend_port="$(awk -F '=' '/^PORT=/{print $2}' "$backend_env" | tail -n1 | tr -d '[:space:]')"
  fi
  if [[ -z "${backend_port:-}" ]]; then
    backend_port=8787
  elif ! [[ "$backend_port" =~ ^[0-9]+$ ]]; then
    log "Warning: Invalid backend port '$backend_port' in $backend_env, falling back to 8787"
    backend_port=8787
  fi
  tmp_conf="$(mktemp)"
  sed "s/__BACKEND_PORT__/$backend_port/g" "$INSTALL_DIR/deploy/nginx/rustadmin.conf" >"$tmp_conf"
  install -m 644 "$tmp_conf" "$NGINX_SITE"
  rm -f "$tmp_conf"
  ln -sf "$NGINX_SITE" "$NGINX_LINK"
  nginx -t
  systemctl reload nginx
}

finalize_permissions() {
  log "Setting permissions"
  chown -R "$USER_NAME":"$GROUP_NAME" "$INSTALL_DIR"
  if [ -f "$INSTALL_DIR/backend/.env" ]; then
    chmod 640 "$INSTALL_DIR/backend/.env"
  fi
}

main() {
  require_root
  detect_source
  ensure_packages ca-certificates gnupg openssl
  install_node
  install_nginx
  prepare_user
  copy_sources
  setup_backend
  configure_backend_env
  finalize_permissions
  install_service
  configure_nginx
  log "Installation complete. API on :8787, UI on :80"
}

main "$@"
