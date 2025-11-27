# Project File Overview

This document summarizes the purpose of the key files and directories that make up the Rust Control Panel project. It is intended to help newcomers understand where particular responsibilities live and to make navigation easier.

## Repository root
- `README.md` – Linux-focused installation and configuration guide for the bundled backend and static frontend.
- `LICENSE` – MIT license for the open-source release of the project.
- `docker-compose.yml` – Example container composition for launching the backend API, Discord bot worker, and static frontend (sharing the same SQLite volume).
- `deploy/` – Production deployment snippets, including sample **nginx** and **systemd** configurations used by the install scripts.
- `backend/` – Express/Socket.IO backend server, database adapters, and optional Discord bot service implemented in Node.js.
- `frontend/` – Static assets served to browsers, including the HTML shell, compiled JavaScript bundle, and module loaders for dashboard widgets.
- `scripts/` – Shell utilities that install, update, and remove the control panel on Linux hosts.

## Backend service (`backend/`)
- `package.json` / `package-lock.json` – Declare backend runtime dependencies (Express, Socket.IO, sqlite/mysql clients, Discord SDK) and start scripts.
- `Dockerfile` – Produces a container image for the backend with Node.js 18, copying the source and installing dependencies.
- `src/index.js` – Entry point that boots Express, attaches Socket.IO, seeds the database, manages RCON sessions, persists chat history, streams kill-feed events, exposes REST APIs (including the Discord/Steam player linking flow), and streams live server data to clients. Also emits optional audit messages to a configured Discord log channel whenever a player completes the linking flow.【F:backend/src/index.js†L1-L160】【F:backend/src/index.js†L708-L846】【F:backend/src/index.js†L6640-L6742】
- `src/auth.js` – JWT-based authentication helpers used by HTTP routes and WebSocket handshakes, including middleware for enforcing admin access.【F:backend/src/auth.js†L1-L36】
- `src/permissions.js` – Normalises role definitions, checks per-server capabilities, filters data by access level, and serialises permission payloads.【F:backend/src/permissions.js†L1-L120】
- `src/db/index.js` – Chooses the configured database driver (SQLite or MySQL), ensures schema migrations, seeds default roles, and provisions the first admin account.【F:backend/src/db/index.js†L1-L63】
- `src/db/combat-log.js` – Shared helper that serialises combat log payloads for database storage while trimming them to fit the 8 KB column limit without corrupting the JSON structure.【F:backend/src/db/combat-log.js†L1-L72】
- `src/db/sqlite.js` – SQLite-backed implementation of the database API, providing CRUD helpers for users, servers, roles, telemetry records, chat logs (including scope/colour metadata), and the `team_auth_*` tables used by the Discord/Steam linking flow.【F:backend/src/db/sqlite.js†L1-L220】【F:backend/src/db/sqlite.js†L200-L360】【F:backend/src/db/sqlite.js†L620-L840】
- `src/db/mysql.js` – MySQL-backed implementation of the database API, including table creation statements and query helpers for user, server, player, chat history data, and the mirrored team-auth schema to keep parity with SQLite.【F:backend/src/db/mysql.js†L1-L200】【F:backend/src/db/mysql.js†L220-L360】【F:backend/src/db/mysql.js†L520-L720】
- `src/rcon.js` – Robust WebRCON client that maintains persistent connections, queues commands, handles keepalive traffic, and emits structured events for the rest of the app.【F:backend/src/rcon.js†L1-L120】
- `src/rustmaps.js` – Utilities for querying the RustMaps API, orchestrating map generation requests, caching results, and downloading map imagery for the live map module.【F:backend/src/rustmaps.js†L1-L80】
- `src/discord-bot-service.js` – Optional background worker that syncs server status to Discord, exposes team-wide status commands, and now provisions a configurable ticketing workflow with a dedicated command token and persistent ticket panel via slash commands.【F:backend/src/discord-bot-service.js†L1-L200】【F:backend/src/discord-bot-service.js†L840-L1508】
- `src/insight-service.js` – Shared heuristics that turn ticket history into short recaps for Discord logs, replacing the previous AI-powered summaries.【F:backend/src/insight-service.js†L1-L60】
- `src/chat-translation.js` – LibreTranslate integration that normalises Rust chat into a configured language before storing/broadcasting it, exposing helpers used by the main HTTP server when chat translation is enabled.【F:backend/src/chat-translation.js†L1-L60】

## Frontend assets (`frontend/`)
- `index.html` – Base HTML shell that loads the compiled assets and hosts the control panel UI, now populated by modular templates for each route-friendly view.【F:frontend/index.html†L1-L23】
- `templates/` – Route-oriented HTML snippets (`login.html`, `app-shell.html`, `dashboard.html`, etc.) that the loader injects into `index.html` so each major page lives in its own file.【F:frontend/templates/app-shell.html†L1-L26】【F:frontend/templates/dashboard.html†L1-L28】
- `ticket-preview.html` – Standalone shareable page that fetches ticket transcripts from the API and renders a Discord-style preview for the selected team ticket.【F:frontend/ticket-preview.html†L1-L217】
- `request.html` – Standalone account-linking page that walks Discord users through completing `/auth/requests/:token` invites by submitting their SteamID64 so the panel can generate a player profile and confirm completion.【F:frontend/request.html†L1-L414】
- `assets/app.js` – Main browser bundle that drives authentication, server management, role administration, chat and kill feed rendering, and orchestrates dynamic modules within the dashboard. Waits for the template loader to finish before wiring DOM handlers.【F:frontend/assets/app.js†L1-L23】【F:frontend/assets/app.js†L10405-L10418】
- `assets/styles.css` – Core stylesheet for layout, dashboard panels, and responsive styling.
- `assets/css/dark-theme.css` – Overrides enabling a dark theme presentation for the control panel.
- `assets/js/template-loader.js` – Loads the view templates into the base HTML and exposes a promise other scripts can await so they attach listeners after the DOM is ready.【F:frontend/assets/js/template-loader.js†L1-L44】
- `assets/js/server-settings.js` – Client-side logic for updating server configuration, credentials, and map metadata from the settings panel; now waits for templates to load before binding events.【F:frontend/assets/js/server-settings.js†L1-L37】【F:frontend/assets/js/server-settings.js†L403-L440】
- `assets/modules/module-loader.js` – Lightweight module registry used by the dashboard to dynamically enable widgets in the workspace view.
- `assets/modules/live-players.js` – Displays the live player list and syncs statuses from the backend.
- `assets/modules/players-graph.js` – Visualises historical player counts for the selected server.
- `assets/modules/players.js` – Provides searchable player management tools, including moderation actions, player notes, profile metadata, and now surfaced Discord identity/alt signals from the team-auth API.
- `assets/modules/team-auth.js` – Lists linked Discord/Steam accounts for the active team, supports filtering, and deep-links into the player directory for moderation follow-up.【F:frontend/assets/modules/team-auth.js†L1-L212】
- `assets/modules/discord-modules.js` – Placeholder bundle to register optional Discord-related widgets while avoiding missing asset errors when the script tag is present in `index.html`.
- `assets/modules/map.js` – Integrates with RustMaps data to render the live map overlay, monument markers, real-time world-event icons (cargo ship, patrol helicopter), and player positions.

## Documentation (`docs/`)
- `module-architecture-guide.md` – Guidelines describing how backend and frontend modules should be organised, when to create shared helpers, and where new features belong so the repository stays consistent.【F:docs/module-architecture-guide.md†L1-L120】
- `module-usage-report.md` – Inventory linking each major source file to its responsibilities, helping maintainers spot unused assets or stale modules quickly.【F:docs/module-usage-report.md†L1-L120】
- `api-error-codes.md` – Reference of the error codes returned by the Discord workflow APIs so the UI can surface actionable troubleshooting hints.
- `live-map-icon-gallery.md` – Reference gallery that showcases the available live-map icons and explains when each should be used for in-game events.【F:docs/live-map-icon-gallery.md†L1-L120】
- `team-auth-oauth.md` – Step-by-step instructions for configuring Discord and Steam OAuth so the `/request.html` team-auth flow can complete successfully, including environment variables and troubleshooting guidance.【F:docs/team-auth-oauth.md†L1-L68】
- `tutorials.md` – Tutorial section with end-to-end setup guidance, OAuth configuration steps, server connection tips, and walkthroughs for common moderation flows like banning players.【F:docs/tutorials.md†L1-L74】
- `assets/icons/map/` – Standalone SVG exports of the live map vector icons for documentation and design reviews.

## Deployment configuration (`deploy/`)
- `nginx/rustadmin.conf` – Sample reverse-proxy configuration for serving the frontend and proxying backend API/WebSocket traffic.
- `systemd/rustadmin-backend.service` – Units for managing the backend service lifecycle on Linux hosts.
- `systemd/rustadmin-discord-bot.service` – Companion unit for the optional Discord bot worker.

## Automation scripts (`scripts/`)
- `install-linux.sh` – Interactive Linux installer that provisions system users, configures services, and deploys the backend/frontend bundle.
- `update-linux.sh` – Upgrade script that pulls the latest release and restarts services safely.
- `uninstall-linux.sh` – Removes installed services, with an optional purge flag to delete persistent data.
- `install-discord-bot-service.sh` – Installs the Discord bot as a standalone service on hosts that only need the integration worker.

The `backend/node_modules/` directory contains third-party packages installed from npm and does not include project-specific source code.
