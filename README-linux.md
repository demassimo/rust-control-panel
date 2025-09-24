# Rust Admin Online — Linux Install

This bundle is ready for **Debian/Ubuntu** with **systemd**. It includes:
- Node.js backend (Express + Socket.IO)
- Swappable DB layer (SQLite or MySQL)
- Players module with Steam sync
- Sample **systemd** unit (backend)
- Sample **nginx** config (static frontend)
- **scripts/install-linux.sh** and **scripts/uninstall-linux.sh**

## Quick Install
```bash
sudo bash scripts/install-linux.sh
# follow the prompts to configure the backend environment
```

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

Set `STEAM_API_KEY=...` for Steam enrichment.
Set `RUSTMAPS_API_KEY=...` to enable the live map module (see https://api.rustmaps.com for keys).

## Access control

- On first boot the panel seeds an `admin / admin123` account; sign in and change it immediately.
- Admins can invite teammates from the **Team access** card in the UI — accounts can be promoted or removed at any time.
- To allow public self-registration set `ALLOW_REGISTRATION=true` in the backend environment (defaults to disabled).
- Set `JWT_SECRET` to a long random value to secure issued session tokens.

## Active server monitoring

- The backend keeps a persistent WebSocket connection for every configured server and polls `status` on an interval.
- Adjust the cadence with `MONITOR_INTERVAL_MS` (default `60000` ms) to balance responsiveness and RCON load.
- Real-time health information and player counts are surfaced in the dashboard and streamed over Socket.IO to connected clients.
