# Module architecture guide

This guide describes how modules are organised across the Rust Control Panel so that future additions end up in the correct
location and participate in the existing wiring.

## Project overview

The application is split into a Node.js backend (Express + Socket.IO) and a static frontend served from `frontend/`. The backend
exposes REST and WebSocket endpoints that drive the live dashboard. The frontend is a vanilla JavaScript single-page experience
powered by a lightweight module loader (`frontend/assets/modules/module-loader.js`) and a host context created in
`frontend/assets/app.js`.

## Backend modules

Backend source files live under `backend/src/` and are plain CommonJS modules. Follow these conventions when adding new backend
behaviour:

- **Entry point**: `backend/src/index.js` wires Express routes, Socket.IO, authentication, and the RCON bridge. New HTTP or socket
  features should be registered from this file (or imported modules called by it).
- **Service modules**: Place feature-specific logic (for example, map ingestion, Discord syncing, or telemetry processing) in
  `backend/src/<feature>.js`. Each module should export explicit functions that the entry point can call.
- **Database adapters**: Shared database access lives in `backend/src/db/`. Add new persistence helpers to
  `backend/src/db/index.js`, keeping dialect-specific logic in the corresponding `mysql.js` or `sqlite.js` file.
- **Team auth flow**: The Discord/Steam verification endpoints live in `backend/src/index.js` with persistence handled by
  the `team_auth_*` tables declared in both database adapters. When extending the flow (for example, tracking additional
  OAuth metadata) update the SQLite and MySQL dialects together and keep the cookie/token helpers in sync.
- **Background workers**: Long-running jobs, such as the Discord bot, should have their own module (for example,
  `backend/src/discord-bot-service.js`) and a matching entry point in `deploy/systemd/` or `scripts/` if they are launched
  separately from the HTTP server. Shared helpers that are reused across worker features (for example, Discord-specific
  date/ID/timestamp formatting) belong in small focused modules such as `backend/src/discord-bot-utils.js` so the main
  worker file stays readable and easy to extend.

When introducing a new backend module, ensure it is required from the entry point or another module that is part of the startup
path so the file is bundled by Node.js and actually executed.

## Frontend modules

The frontend dashboard is composed from a static HTML shell (`frontend/index.html`) plus the JavaScript assets inside
`frontend/assets/`.

- **Module loader**: `frontend/assets/modules/module-loader.js` exposes `ModuleLoader.register` and `ModuleLoader.init`. Every
  dashboard card is a self-registering module that calls `ModuleLoader.register({...})`.
- **Feature modules**: Place new dashboard cards in `frontend/assets/modules/`. Each module should register itself with a unique
  `id`, declare the card title/icon, and provide a `setup(ctx)` function. Import shared utilities from `frontend/assets/app.js`
  or create a reusable helper under `frontend/assets/js/`.
- **Linked account directory**: `frontend/assets/modules/team-auth.js` demonstrates consuming the `/api/team/auth/profiles`
  endpoint to render Discord/Steam link data on the dashboard. Use it as a reference for modules that need to listen to
  team-switch events or call authenticated APIs from within the module context.
- **Global scripts**: Cross-cutting helpers that need to run before modules are initialised belong in `frontend/assets/js/`. These
  scripts are loaded directly via `<script>` tags in `frontend/index.html`.
- **Registration**: For a module to run, add a `<script src="assets/modules/<name>.js"></script>` tag to `frontend/index.html`
  (after the module loader but before `assets/app.js`). Alternatively, bundle the module into `assets/app.js` if you use a build
  step.
- **Removal of dead code**: Previously unreferenced scripts (`live-console.js` and `panel-shell.js`) have been deleted. Reintroduce
  equivalent functionality only when you also wire the module into `index.html` so it participates in the dashboard lifecycle.

Keep modules focused: the module file should handle DOM rendering and interactions for its own card, while shared state and
Socket.IO events are orchestrated from `assets/app.js`.

## Adding documentation

Whenever you add, move, or remove modules, update the following references:

1. `FILES.md` – keep the file inventory accurate.
2. `docs/module-usage-report.md` – document how the new module is referenced and whether additional integration steps are needed.
3. This guide – describe any new patterns or directories introduced by your change.

Maintaining these documents ensures future contributors quickly understand how modules are structured and prevents redundant code
from lingering in the repository.
