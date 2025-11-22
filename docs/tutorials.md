# Tutorial guides

This tutorial bundle walks new administrators through installing the control panel, configuring Discord + Steam OAuth, connecting a Rust server, and performing common moderation actions like banning a disruptive player. The steps are written for non-technical operators, with plain-language notes about where to click and what to copy so you can succeed even if you have never edited a backend file before. Use the indexed sections below to jump to the workflow you need.

1. [Install the panel](#1-install-the-panel)
2. [Configure OAuth for Discord and Steam](#2-configure-oauth-for-discord-and-steam)
3. [Create admin accounts and roles (no invites yet)](#3-create-admin-accounts-and-roles-no-invites-yet)
4. [Connect a Rust server](#4-connect-a-rust-server)
5. [Ban or unban a player](#5-ban-or-unban-a-player)
6. [Audit logs and exports](#6-audit-logs-and-exports)
7. [Discord bot + ticket panel](#7-discord-bot--ticket-panel)
8. [Maps and wipes](#8-maps-and-wipes)
9. [Server announcements](#9-server-announcements)
10. [Backups and updates](#10-backups-and-updates)
11. [Troubleshooting tips](#11-troubleshooting-tips)
12. [Change backend settings safely](#12-change-backend-settings-safely)

## 1) Install the panel
- Follow the Linux installer in [`scripts/install-linux.sh`](../scripts/install-linux.sh) or deploy with Docker Compose from `docker-compose.yml`.
- After installation the backend `.env` lives at `/opt/rustadmin/backend/.env`. Keep this file private and back it up securely.
- Start services with `systemctl start rustadmin-backend` and (optionally) `systemctl start rustadmin-discord-bot`. Use `systemctl status` on each unit to verify they are running.

## 2) Configure OAuth for Discord and Steam
Team authentication links Discord and Steam accounts so staff can see alt history. Set these environment values in `/opt/rustadmin/backend/.env` (open the file with `sudo nano /opt/rustadmin/backend/.env`) and restart the backend when finished so the panel uses the new URLs.

### Discord application
1. Create a Discord application at <https://discord.com/developers/applications>.
2. Enable **OAuth2 → General** and add a redirect URI pointing to your panel host (for example `https://panel.example.com/api/auth/discord/callback`). Replace `panel.example.com` with the exact URL you use to open the panel (such as `https://panel.yourdomain.com`). This prevents Discord from blocking the sign-in because of a domain mismatch.
3. Copy the **Client ID** and **Client Secret** into:
   ```
   DISCORD_OAUTH_CLIENT_ID=...
   DISCORD_OAUTH_CLIENT_SECRET=...
   DISCORD_OAUTH_REDIRECT_URI=https://panel.yourdomain.com/api/auth/discord/callback
   ```
4. (Optional) If you use the Discord bot worker, also invite the bot to your guild and configure the ticket panel role settings in the backend `.env`.

### Steam OpenID
1. No API key is required for sign-in, but you must declare the callback URLs. Swap `panel.yourdomain.com` for the address where you actually reach the panel so Steam returns users to your real host instead of the placeholder:
   ```
   STEAM_OPENID_RETURN_URL=https://panel.yourdomain.com/api/auth/steam/callback
   STEAM_OPENID_REALM=https://panel.yourdomain.com
   ```
2. Set a dedicated secret for OAuth state cookies:
   ```
   TEAM_AUTH_STATE_SECRET=long_random_value
   ```
3. Restart the backend service (`systemctl restart rustadmin-backend`) so the new settings take effect; OAuth changes do not apply until the service is reloaded.

### Test the linking flow
- Visit `https://panel.yourdomain.com/request.html` (replace with your panel URL). If you distribute one shared signup URL, send this link directly to staff so they can sign in.
- Sign in with Discord when prompted, then sign in with Steam. A success page confirms the accounts were linked and the configured role is applied.
- If Discord or Steam rejects the callback, double-check the redirect URLs and secrets above.

## 3) Create admin accounts and roles (no invites yet)
- Sign in with the seeded `admin / admin123` credentials, then change the password immediately from **Profile → Change password**.
- Because this build does **not** include a team invite system yet, create any new staff accounts manually: go to **Users** in the sidebar, click **New user**, and fill in a username, email, and temporary password. Share the password with the staff member and ask them to change it after logging in.
- Use the built-in role presets (Admin/Moderator/Viewer) as a starting point, or open the role editor to customize what each role can see or change.
- If you allow public self-registration, set `ALLOW_REGISTRATION=true` in the `.env`, but still review every new user in **Users** before granting higher permissions.

## 4) Connect a Rust server
1. Navigate to **Settings → Servers** and click **Add server**.
2. Enter the server name, IP/host, RCON port, and RCON password. Save to establish the connection.
3. Watch the **Server status** widget or the live player list to confirm the panel is receiving updates. Adjust `MONITOR_INTERVAL_MS` in the `.env` if you need a faster poll cadence.

## 5) Ban or unban a player
1. Open the **Players** module from the dashboard.
2. Search for the player by SteamID, display name, or linked Discord account.
3. Click the player row to open the profile; use **Ban** to issue a ban with an optional reason. The action is sent over RCON to the connected server.
4. To lift the restriction later, return to the profile and select **Unban**.
5. Keep moderation notes in the player profile so future staff can see prior actions and context.

## 6) Audit logs and exports
1. Open **Audit log** from the sidebar to review sign-ins, bans, kicks, and server configuration changes.
2. Filter by user, action type, or timeframe to isolate incidents quickly.
3. Use **Export CSV** to download filtered events for incident reviews or sharing with other admins.
4. Store exports in your secured team storage; do not share them publicly because they can contain IPs and SteamIDs.

## 7) Discord bot + ticket panel
1. Ensure the backend service account can reach Discord (`DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, and `DISCORD_TICKET_PANEL_CHANNEL_ID` are set in the backend `.env`; edit the file with `sudo nano /opt/rustadmin/backend/.env` if needed). These values only authorize the bot—ticket setup happens inside the panel UI.
2. Restart the worker or backend service so the bot connects to Discord after configuration changes.
3. In Discord, create or choose a text channel where you want tickets posted. Then, in the panel UI, open **Discord tickets** and run the **Create ticket panel** action to publish the interactive message—no backend edits are required beyond the bot credentials.
4. When players open a ticket, you will see it appear in the configured channel; reply in-thread to keep conversations organized.
5. Use the **Close ticket** action when resolved to archive the thread and avoid clutter.

## 8) Maps and wipes
1. Go to **Maps** to upload a new map image. Use a square PNG and keep the file size under the backend's `MAX_MAP_IMAGE_BYTES` value.
2. Use **Assign map** to link the upload to a specific server so live positions display correctly.
3. Before a scheduled wipe, duplicate the existing map entry and mark the new one with the wipe date; this keeps historical data intact.
4. After wiping the game server, update the active map in **Maps → Active map** so players see the new terrain immediately.

## 9) Server announcements
1. Navigate to **Announcements** in the panel.
2. Create a new announcement with start/end times to control visibility.
3. Choose target servers if you manage multiple instances so the message appears only where relevant.
4. Save and confirm the announcement appears on the dashboard for connected players.

## 10) Backups and updates
1. Back up `/opt/rustadmin/backend/.env` and your database (check `docker-compose.yml` or your service unit for the data directory) before upgrades.
2. When using Docker, pull the latest images and run `docker-compose up -d` to deploy updates.
3. For bare-metal installs, rerun `scripts/install-linux.sh` to fetch the latest release, then restart services with `systemctl restart rustadmin-backend rustadmin-discord-bot`.
4. After updating, verify the dashboard loads, RCON connects, OAuth works, and audit logging still records events.

## 11) Troubleshooting tips
- If the live map or player list does not update, verify the server's RCON password and that your firewall allows RCON traffic from the panel host.
- For OAuth errors, use browser dev tools to confirm the callback URL and check backend logs (`journalctl -u rustadmin-backend -f`).
- When uploading large map images, ensure your reverse proxy body size limit matches or exceeds the backend's `MAX_MAP_IMAGE_BYTES` setting.
- If the Discord bot stays offline, confirm the token and guild ID, and that outbound HTTPS traffic to Discord is allowed from the host.
- If staff cannot sign in after you add them manually, reset their password from **Users** and confirm they are assigned to the right role.

## 12) Change backend settings safely
These steps keep server operators comfortable even if they are new to Linux or editing configuration files.

1. **Open the settings file.** SSH to the panel server and run `sudo nano /opt/rustadmin/backend/.env`. Press the arrow keys to move around; do not delete lines you do not recognize. Nano writes changes directly to disk so you do not need a separate upload step.
2. **Update carefully.** Replace placeholder domains (for example, change any `panel.example.com` to your real panel URL like `panel.yourdomain.com`). For secrets, paste the exact values from the provider dashboards without extra spaces—accurate values avoid confusing OAuth failures.
3. **Save and exit.** Press `Ctrl+O` to save, then `Enter`, then `Ctrl+X` to close Nano.
4. **Restart the service.** Run `sudo systemctl restart rustadmin-backend` (and `sudo systemctl restart rustadmin-discord-bot` if you use the bot) so the new settings take effect.
5. **Verify in the UI.** Open the panel in your browser and sign in. Check **Settings → Servers** and the OAuth flows to ensure everything loads without errors.

Use these tutorials as a starting point and expand them with team-specific workflows as your panel deployment evolves.
