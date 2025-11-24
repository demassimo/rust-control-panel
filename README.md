# Rust Control Panel — Linux Install

This bundle is ready for **Debian/Ubuntu** with **systemd**. It includes:
- Node.js backend (Express + Socket.IO)
- Swappable DB layer (SQLite or MySQL)
- Players module with Steam sync
- Sample **systemd** unit (backend)
- Sample **nginx** config (static frontend over HTTPS)
- **scripts/install-linux.sh** and **scripts/uninstall-linux.sh**

## Quick Install
```bash
git clone https://github.com/demassimo/rust-control-panel.git
cd rust-control-panel
sudo bash scripts/install-linux.sh
# follow the prompts to configure the backend environment
```

### HTTPS and TLS certificates

The installer now provisions a **self-signed** TLS certificate for the hostname you provide in `PANEL_PUBLIC_URL` and configures nginx to listen on port **443**. The certificate and key live at `/etc/nginx/ssl/rustadmin.crt` and `/etc/nginx/ssl/rustadmin.key`, and port **80** automatically redirects to HTTPS. When upgrading an existing install, the installer and update script generate a new certificate if they don't find one and will prompt for the hostname to embed in that cert when the current configuration doesn't specify one.

Browsers will show a warning until you trust the certificate or replace it with one from a public CA. To swap in a trusted certificate, update those files and reload nginx.

Need a tour of the codebase? Check out [`FILES.md`](FILES.md) for a high-level description of each file and directory.

Looking for a step-by-step walkthrough? The [tutorial guides](docs/tutorials.md) cover installation, OAuth setup, server connections, moderation, Discord tickets, announcements, maps/wipes, and backup/upgrade routines with non-technical explanations for backend settings.

## Environment configuration

The backend service reads its environment variables from `/opt/rustadmin/backend/.env`. Open this file with `sudo nano /opt/rustadmin/backend/.env` to adjust settings without uploading new files. If you deploy to a different base
directory, update your systemd service or deployment scripts so they point to the actual `.env` location before starting the
backend.

## License

This project is released under the **Rust Control Panel Personal Use License**, which allows you to use, modify, and share the software for personal, educational, or internal business purposes. Commercial redistribution, resale, or rebranding for sale is not permitted. See [`LICENSE`](LICENSE) for the full terms.

## Uninstall
```bash
# Safe uninstall (keeps data in /opt/rustadmin)
sudo bash scripts/uninstall-linux.sh

# Full purge (removes app dir and system user)
sudo bash scripts/uninstall-linux.sh --purge
```

## DB options

In `/opt/rustadmin/backend/.env`:

- **SQLite (default)**
```
DB_CLIENT=sqlite
SQLITE_FILE=./data/panel.sqlite
```

- **MySQL**
```
DB_CLIENT=mysql
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=rustadmin
MYSQL_PASSWORD=strongpass
MYSQL_DATABASE=rustadmin
```

Set `STEAM_API_KEY=...` for Steam enrichment, or store a team-specific key from **Discord → Main Bot settings** to override the global value.
Set `RUSTMAPS_API_KEY=...` to provide a fallback RustMaps key (optional). Each panel user can store their own key from **Settings → Personal settings** — required for the live map module (see https://api.rustmaps.com for keys).
Set `PANEL_PUBLIC_URL=https://your-panel.example.com` so ticket preview links shared over Discord resolve to the correct public hostname.

### Two-factor authentication and passkeys

The panel supports both TOTP codes and WebAuthn passkeys for MFA. To keep registration and sign-in working in all browsers:

- Point `PANEL_PUBLIC_URL` at the URL users type into their browser (e.g., `https://panel.example.com`). The installer now prompts for this value and writes it to the backend `.env` alongside `PASSKEY_ORIGIN`.
- Set `PASSKEY_RP_ID` to the host portion of that URL (no scheme or port, e.g., `panel.example.com`). When omitted, the backend falls back to the request host or `localhost` instead of `0.0.0.0`.
- Restart the backend after updating the `.env` so new passkey settings take effect.
- If you run behind a reverse proxy, keep `TRUST_PROXY=true` (default) so the backend reads the forwarded host/protocol for passkey validation.

Admins can enroll MFA from **Settings → Security** in the UI. Enable TOTP by scanning the QR code with an authenticator app, or add a passkey using a supported browser platform authenticator.

### Discord & Steam account linking

Team authentication links now rely on OAuth flows for both Discord and Steam. Configure these backend environment variables so players can connect their accounts and receive the configured Discord role automatically:

- `DISCORD_OAUTH_CLIENT_ID` and `DISCORD_OAUTH_CLIENT_SECRET` — credentials from your Discord application.
- `DISCORD_OAUTH_REDIRECT_URI` — the publicly reachable callback URL (defaults to `https://<host>/api/auth/discord/callback` when omitted).
- `STEAM_OPENID_RETURN_URL` — the callback URL Steam should redirect to (defaults to `https://<host>/api/auth/steam/callback`).
- `STEAM_OPENID_REALM` — optional OpenID realm sent to Steam (defaults to the request origin).
- `TEAM_AUTH_STATE_SECRET` — secret used to sign OAuth state and session cookies (falls back to `JWT_SECRET`, but a dedicated value is recommended).

You can also manage the Discord OAuth client ID/secret/redirect URI and the Steam Web API key from **Discord → Main Bot settings** in the panel. Values saved in the dashboard override the environment defaults for that team while keeping existing bot tokens intact.

The bot credentials for Discord tickets (`DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, and `DISCORD_TICKET_PANEL_CHANNEL_ID`) also live in this file, but the ticket panel itself is created from the web UI—once the bot variables are set, publish the panel from **Discord tickets → Create ticket panel**.

With these values in place the `/request.html` flow prompts users to sign in with both providers before the panel links their Steam ID to their Discord account, assigns the configured team-auth role, and gives staff better visibility into potential alternate accounts.

See [docs/team-auth-oauth.md](docs/team-auth-oauth.md) for a full walkthrough that covers provider setup, required environment variables, and troubleshooting tips for the linking flow.

## Access control

- On first boot the panel seeds an `admin / admin123` account; sign in and change it immediately.
- Team invites are not available in this build yet; create staff accounts manually from **Users → New user** and adjust their role after they sign in.
- To allow public self-registration set `ALLOW_REGISTRATION=true` in the backend environment (defaults to disabled).
- Set `JWT_SECRET` to a long random value to secure issued session tokens.

## Active server monitoring

- The backend keeps a persistent WebSocket connection for every configured server and polls `status` on an interval.
- Adjust the cadence with `MONITOR_INTERVAL_MS` (default `60000` ms) to balance responsiveness and RCON load.
- Real-time health information and player counts are surfaced in the dashboard and streamed over Socket.IO to connected clients.

  ## Raising map upload limits

- The panel accepts custom map images up to **40 MB** by default (see `MAX_MAP_IMAGE_BYTES` in `backend/src/index.js`).
- If you host the panel behind **nginx**, set `client_max_body_size 40M;` (or higher) in your site config and reload nginx.
- For **Caddy**, configure `request_body { max_size 40MB }` (or higher) on the site handling the panel.
- When reverse proxies enforce a lower cap you will see HTTP 413 errors during upload — raise the proxy limit first, then adjust `MAX_MAP_IMAGE_BYTES` if you need to allow even larger files.
