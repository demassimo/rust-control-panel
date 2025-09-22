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
