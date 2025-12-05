#!/usr/bin/env bash
set -euo pipefail

USER_NAME=rustadmin
GROUP_NAME=rustadmin
INSTALL_DIR=/opt/rustadmin
SERVICE_NAME=rustadmin-backend
SERVICE_FILE=/etc/systemd/system/${SERVICE_NAME}.service
DISCORD_SERVICE_NAME=rustadmin-discord-bot
DISCORD_SERVICE_FILE=/etc/systemd/system/${DISCORD_SERVICE_NAME}.service
NGINX_SITE=/etc/nginx/sites-available/rustadmin.conf
NGINX_LINK=/etc/nginx/sites-enabled/rustadmin.conf
NGINX_SSL_DIR=/etc/nginx/ssl
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR=""
LIBRETRANSLATE_CONTAINER=rustadmin-libretranslate
LIBRETRANSLATE_IMAGE=libretranslate/libretranslate:latest
LIBRETRANSLATE_LANGS="af,ar,az,bg,bn,ca,cs,da,de,el,en,eo,es,et,eu,fa,fi,fr,ga,gl,he,hi,hu,id,it,ja,ko,ky,lt,lv,ms,nb,nl,pl,pt,pt-BR,ro,ru,sk,sl,sq,sr,sv,th,tl,tr,uk,ur,vi,zh-Hans,zh-Hant"

log() {
  echo "[*] $*"
}

warn() {
  echo "[!] $*" >&2
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

install_ollama() {
  if command -v ollama >/dev/null 2>&1; then
    log "Ollama already installed"
    systemctl enable --now ollama >/dev/null 2>&1 || true
    return 0
  fi
  log "Installing Ollama runtime"
  ensure_packages curl ca-certificates
  if curl -fsSL https://ollama.com/install.sh | sh; then
    systemctl enable --now ollama >/dev/null 2>&1 || true
    return 0
  fi
  warn "Ollama installation failed. Install it manually before using the AI assistant."
  return 1
}

install_docker() {
  if command -v docker >/dev/null 2>&1; then
    systemctl enable --now docker >/dev/null 2>&1 || true
    return
  fi
  log "Installing Docker engine (docker.io)"
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io
  systemctl enable --now docker
}

install_libretranslate_container() {
  local host_port="${1:-5000}"
  install_docker
  if docker ps -a --format '{{.Names}}' | grep -q "^${LIBRETRANSLATE_CONTAINER}$"; then
    log "Stopping existing LibreTranslate container"
    docker rm -f "$LIBRETRANSLATE_CONTAINER" >/dev/null 2>&1 || true
  fi
  log "Pulling ${LIBRETRANSLATE_IMAGE}"
  docker pull "$LIBRETRANSLATE_IMAGE"
  log "Starting LibreTranslate on port ${host_port}"
  docker run -d \
    --name "$LIBRETRANSLATE_CONTAINER" \
    --restart unless-stopped \
    -p "${host_port}:5000" \
    -e "LT_LOAD_ONLY=${LIBRETRANSLATE_LANGS}" \
    -e LT_UPDATE_MODELS=true \
    "$LIBRETRANSLATE_IMAGE" >/dev/null
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

  local panel_public_url
  panel_public_url="$(prompt_with_default "Public panel URL (scheme + host used by browsers)" "http://localhost")"

  local passkey_rp_id
  passkey_rp_id="$(prompt_with_default "Passkey RP ID host (leave blank to derive from panel URL)" "")"

  if [[ -z "$passkey_rp_id" && -n "$panel_public_url" ]]; then
    passkey_rp_id="$(printf '%s' "$panel_public_url" | sed -E 's#^[a-zA-Z]+://##' | cut -d/ -f1 | cut -d: -f1)"
  fi

  local default_secret
  default_secret="$(generate_secret)"
  local jwt_secret
  jwt_secret="$(prompt_with_default "JWT secret" "$default_secret")"

  local steam_api_key
  steam_api_key="$(prompt_with_default "Steam API key (leave blank to disable sync)" "")"

  local ai_model_name
  ai_model_name="$(prompt_with_default "Local AI model name for Ollama (leave blank to disable AI assistant)" "")"
  local ai_api_url=""
  if [[ -n "$ai_model_name" ]]; then
    ai_api_url="$(prompt_with_default "Local AI HTTP endpoint" "http://127.0.0.1:11434")"
  fi

  local enable_chat_translation="n"
  local chat_translate_target="en"
  local chat_translate_source="auto"
  local chat_translate_url=""
  local chat_translate_api_key=""
  local install_local_translator="n"
  local chat_translate_port="5000"
  if prompt_confirm "Enable chat translation via LibreTranslate?" "n"; then
    enable_chat_translation="y"
    chat_translate_target="$(prompt_with_default "Target language code (e.g., en, ru, de)" "$chat_translate_target")"
    chat_translate_source="$(prompt_with_default "Source language (auto for detection)" "$chat_translate_source")"
    if prompt_confirm "Install a local LibreTranslate Docker container?" "y"; then
      install_local_translator="y"
      chat_translate_port="$(prompt_with_default "Host port for LibreTranslate" "$chat_translate_port")"
      chat_translate_url="http://127.0.0.1:${chat_translate_port}"
    else
      chat_translate_url="$(prompt_with_default "LibreTranslate base URL" "http://127.0.0.1:5000")"
    fi
    chat_translate_api_key="$(prompt_with_default "LibreTranslate API key (leave blank if none)" "")"
  fi

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
    if [[ -n "$panel_public_url" ]]; then
      printf 'PANEL_PUBLIC_URL=%s\n' "$panel_public_url"
      printf 'PASSKEY_ORIGIN=%s\n' "$panel_public_url"
    fi
    if [[ -n "$passkey_rp_id" ]]; then
      printf 'PASSKEY_RP_ID=%s\n' "$passkey_rp_id"
    fi
    printf 'JWT_SECRET=%s\n' "$jwt_secret"
    if [[ -n "$steam_api_key" ]]; then
      printf 'STEAM_API_KEY=%s\n' "$steam_api_key"
    fi
    if [[ -n "$ai_model_name" ]]; then
      printf 'AI_MODEL_NAME=%s\n' "$ai_model_name"
      if [[ -n "$ai_api_url" ]]; then
        printf 'AI_API_URL=%s\n' "$ai_api_url"
      fi
    fi
    if [[ "$enable_chat_translation" == "y" ]]; then
      printf 'CHAT_TRANSLATE_TARGET_LANG=%s\n' "$chat_translate_target"
      if [[ -n "$chat_translate_source" && "$chat_translate_source" != "auto" ]]; then
        printf 'CHAT_TRANSLATE_SOURCE_LANG=%s\n' "$chat_translate_source"
      fi
      if [[ -n "$chat_translate_url" ]]; then
        printf 'CHAT_TRANSLATE_URL=%s\n' "$chat_translate_url"
      fi
      if [[ -n "$chat_translate_api_key" ]]; then
        printf 'CHAT_TRANSLATE_API_KEY=%s\n' "$chat_translate_api_key"
      fi
    fi
  } >"$env_file"

  if [[ -n "$ai_model_name" ]]; then
    install_ollama || true
    if command -v ollama >/dev/null 2>&1; then
      local ollama_host="${ai_api_url:-http://127.0.0.1:11434}"
      log "Pulling Ollama model ${ai_model_name} (this may take a few minutes)"
      if ! OLLAMA_HOST="$ollama_host" ollama pull "$ai_model_name"; then
        warn "Failed to pull Ollama model '${ai_model_name}'. Run 'OLLAMA_HOST=\"$ollama_host\" ollama pull \"$ai_model_name\"' manually later."
      fi
    fi
  fi

  if [[ "$install_local_translator" == "y" ]]; then
    install_libretranslate_container "$chat_translate_port"
  fi
}

run_backend_migrations() {
  log "Database migration step"
  if [ ! -f "$INSTALL_DIR/backend/.env" ]; then
    warn "Backend .env not found; skipping database migration"
    return
  fi

  if ! [ -t 0 ]; then
    warn "Non-interactive session detected; skipping automatic migrations. Run 'npm run migrate' from $INSTALL_DIR/backend after preparing the database."
    return
  fi

  if ! prompt_confirm "Run database migrations now? (recommended for upgrades when the database already exists)" "n"; then
    log "Skipping database migration. Run 'npm run migrate' from $INSTALL_DIR/backend once your database is ready."
    return
  fi

  (cd "$INSTALL_DIR/backend" && npm run migrate --silent)
}

install_backend_service() {
  log "Installing systemd service"
  systemctl stop "$SERVICE_NAME" 2>/dev/null || true
  install -m 644 "$INSTALL_DIR/deploy/systemd/${SERVICE_NAME}.service" "$SERVICE_FILE"
  systemctl daemon-reload
  systemctl enable --now "$SERVICE_NAME"
}

install_discord_bot_service() {
  if [ ! -f "$INSTALL_DIR/deploy/systemd/${DISCORD_SERVICE_NAME}.service" ]; then
    log "Discord bot service definition missing, skipping"
    return
  fi
  log "Installing Discord bot service"
  INSTALL_DIR="$INSTALL_DIR" USER_NAME="$USER_NAME" GROUP_NAME="$GROUP_NAME" \
    bash "$SCRIPT_DIR/install-discord-bot-service.sh"
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
  mkdir -p "$NGINX_SSL_DIR"

  local panel_public_url panel_host san_target cert_file key_file
  if [ -f "$backend_env" ]; then
    panel_public_url="$(awk -F '=' '/^PANEL_PUBLIC_URL=/{print $2}' "$backend_env" | tail -n1 | tr -d '[:space:]')"
  else
    panel_public_url=""
  fi
  panel_host="$(printf '%s' "${panel_public_url:-}" | sed -E 's#^[a-zA-Z]+://##' | cut -d/ -f1 | cut -d: -f1)"

  cert_file="$NGINX_SSL_DIR/rustadmin.crt"
  key_file="$NGINX_SSL_DIR/rustadmin.key"
  local needs_cert="false"
  if [[ ! -f "$cert_file" || ! -f "$key_file" ]]; then
    needs_cert="true"
  fi

  if [[ -z "$panel_host" && "$needs_cert" == "true" ]]; then
    panel_host="$(prompt_with_default "Hostname for self-signed TLS certificate" "$(hostname -f 2>/dev/null || echo localhost)")"
  fi

  if [[ -z "$panel_host" ]]; then
    panel_host="localhost"
  fi

  if [[ "$panel_host" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    san_target="IP:${panel_host}"
  else
    san_target="DNS:${panel_host}"
  fi

  if [[ "$needs_cert" == "true" ]]; then
    log "Generating self-signed TLS certificate for $panel_host"
    openssl req -x509 -nodes -newkey rsa:4096 -days 825 \
      -keyout "$key_file" -out "$cert_file" \
      -subj "/CN=${panel_host}" -addext "subjectAltName=${san_target}"
    chmod 600 "$key_file"
    chmod 644 "$cert_file"
  else
    log "Using existing TLS certificate at $cert_file"
  fi

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
  install_docker
  prepare_user
  copy_sources
  setup_backend
  configure_backend_env
  run_backend_migrations
  finalize_permissions
  install_backend_service
  install_discord_bot_service
  configure_nginx
  log "Installation complete. API on :8787, UI on :443 (self-signed TLS)"
}

main "$@"
