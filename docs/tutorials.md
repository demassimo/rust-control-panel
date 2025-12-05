# Rust Control Panel – Beginner-Friendly Tutorials

These guides show **non-technical staff** how to install the panel, link Discord/Steam, connect Rust servers, run moderation actions, manage tickets, post announcements, and perform everyday tasks confidently. Instructions are written in **plain language**, with clear notes on *where to click* and *what to copy*, and no programming knowledge required.

Use the table of contents to jump directly to what you need:

1. [Install the panel](#1-install-the-panel)  
2. [Configure OAuth for Discord and Steam](#2-configure-oauth-for-discord-and-steam)  
3. [Create admin accounts and assign roles](#3-create-admin-accounts-and-roles)  
4. [Connect a Rust server](#4-connect-a-rust-server)  
5. [Ban or unban a player](#5-ban-or-unban-a-player)  
6. [Audit logs and exports](#6-audit-logs-and-exports)  
7. [Discord bot + ticket panel](#7-discord-bot--ticket-panel)  
8. [Maps and wipes](#8-maps-and-wipes)  
9. [Server announcements](#9-server-announcements)  
10. [Backups and updates](#10-backups-and-updates)  
11. [Troubleshooting (simple checks)](#11-troubleshooting-tips)  
12. [Changing backend settings safely](#12-change-backend-settings-safely)

---

# 1) Install the panel

If you are not technical, get your server host to complete the install steps. After installation, *you do not need to touch Linux again*—everything is done through the web panel.

## Option A – Linux Installer

```
bash scripts/install-linux.sh
```

## Option B – Docker Compose

```
docker-compose up -d
```

### Important files

- Main settings file: `/opt/rustadmin/backend/.env`

### Optional: chat translation

To force all Rust chat into a single language, point the backend at LibreTranslate:

```
CHAT_TRANSLATE_TARGET_LANG=en
CHAT_TRANSLATE_URL=https://libretranslate.example.com   # optional
CHAT_TRANSLATE_API_KEY=                                 # optional
```

Restart the backend after editing `.env` so the translator is enabled.

During the Linux installer, answer “yes” to the chat translation prompt to have it pull and run a local LibreTranslate Docker container automatically (defaults to `http://127.0.0.1:5000`).
The installer now starts LibreTranslate with `LT_UPDATE_MODELS=true` and preloads the panel's language list via `LT_LOAD_ONLY=af,ar,az,bg,bn,ca,cs,da,de,el,en,eo,es,et,eu,fa,fi,fr,ga,gl,he,hi,hu,id,it,ja,ko,ky,lt,lv,ms,nb,nl,pl,pt,pt-BR,ro,ru,sk,sl,sq,sr,sv,th,tl,tr,uk,ur,vi,zh-Hans,zh-Hant` so languages like Afrikaans translate correctly without extra setup.

### Start & check services

```
sudo systemctl start rustadmin-backend
sudo systemctl start rustadmin-discord-bot
sudo systemctl status rustadmin-backend
```

---

# 2) Configure OAuth for Discord and Steam

## Discord Setup

1. Go to: https://discord.com/developers/applications  
2. Create app → OAuth2 → Add redirect:

```
https://panel.yourdomain.com/api/auth/discord/callback
```

3. Add to `.env`:

```
DISCORD_OAUTH_CLIENT_ID=xxxx
DISCORD_OAUTH_CLIENT_SECRET=xxxx
DISCORD_OAUTH_REDIRECT_URI=https://panel.yourdomain.com/api/auth/discord/callback
```

4. Restart backend.

```
sudo systemctl restart rustadmin-backend
```

## Steam Setup

```
STEAM_OPENID_RETURN_URL=https://panel.yourdomain.com/api/auth/steam/callback
STEAM_OPENID_REALM=https://panel.yourdomain.com
TEAM_AUTH_STATE_SECRET=long_random_secret
```

Restart again.

## Test Login

Visit:

```
https://panel.yourdomain.com/request.html
```

Login with Discord → Steam.

---

# 3) Create admin accounts and roles

Login with:

```
admin / admin123
```

Change password immediately.

## Add staff manually

1. Go to **Users**  
2. Click **New User**  
3. Enter username, email, temp password  
4. Assign a role (Admin / Moderator / Viewer)

---

# 4) Connect a Rust server

1. Go to: **Settings → Servers**  
2. Click **Add Server**  
3. Enter server name, IP, RCON port, RCON password  
4. Save  

Panel shows:
- Online status  
- Player list  
- Map data (once uploaded)

---

# 5) Ban or unban a player

## Ban

1. Open **Players**  
2. Search  
3. Click the player  
4. Click **Ban**  
5. Add reason  
6. Confirm  

## Unban

Open profile → **Unban**

---

# 6) Audit logs and exports

1. Open **Audit Log**  
2. Filter by user/action/date  
3. Export CSV for reports

---

# 7) Discord Bot + Ticket Panel

## .env entries

```
DISCORD_BOT_TOKEN=xxxx
DISCORD_GUILD_ID=xxxx
DISCORD_TICKET_PANEL_CHANNEL_ID=xxxx
```

Restart bot:

```
sudo systemctl restart rustadmin-discord-bot
```

## Create panel in Discord

In panel → **Discord Tickets → Create Ticket Panel**

Players click → thread opens → staff reply → close when done.

---

# 8) Maps and wipes

## Upload map

1. Go to **Maps**  
2. Upload PNG (square)  
3. Assign to server  

## Before wipe
Duplicate map → name it with wipe date.

## After wipe
Set new active map.

---

# 9) Server announcements

1. Go to **Announcements**  
2. Click **New Announcement**  
3. Enter schedule + message  
4. Select target servers  
5. Save  

---

# 10) Backups and updates

## Back up before updating:

- `.env`
- Database directory

## Update (Docker)

```
docker-compose pull
docker-compose up -d
```

## Update (Linux)

```
bash scripts/install-linux.sh
sudo systemctl restart rustadmin-backend
sudo systemctl restart rustadmin-discord-bot
```

---

# 11) Troubleshooting Tips

- Live map not updating → wrong RCON password/port or firewall  
- OAuth failing → check redirect URLs  
- Map upload failing → reverse proxy too small body limit  
- Discord bot offline → wrong token or firewall  
- Staff can't log in → wrong role/password  

---

# 12) Change backend settings safely

## Edit settings

```
sudo nano /opt/rustadmin/backend/.env
```

## Save

- `Ctrl+O` → Enter  
- `Ctrl+X`

## Restart

```
sudo systemctl restart rustadmin-backend
sudo systemctl restart rustadmin-discord-bot
```

## Verify

Open the panel → log in → check servers + bot.
