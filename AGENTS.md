# Agent guidelines

Welcome to the Rust Control Panel repository. This project delivers a Node.js backend paired with a static JavaScript frontend
that together provide a management dashboard for Rust game servers.

## How the project is structured

- **Backend (`backend/`)** – Express + Socket.IO service handling authentication, RCON connectivity, database access, and optional
  Discord integration.
- **Frontend (`frontend/`)** – Static HTML/CSS/JS bundle that renders the dashboard and consumes real-time data from the backend.
- **Deployment (`deploy/`, `scripts/`, `docker-compose.yml`)** – Operational assets used to install or host the panel.
- **Documentation (`docs/`, `FILES.md`)** – Living references that describe the system architecture and file inventory.

## Documentation expectations

When you add or modify modules, consult `docs/module-architecture-guide.md` for placement rules and update it if you introduce a
new pattern. Keep `docs/module-usage-report.md` aligned with the current code so that unused files are easy to spot.

## Coding conventions

- Prefer small, focused modules that export explicit functions.
- Remove dead code rather than leaving unused files around.
- Update relevant documentation (`FILES.md`, the module usage report, and the architecture guide) whenever you add, move, or
  delete modules.

Following these notes ensures the repository stays easy to navigate for future contributors.

ANY NEW CONVARS OR ENV NEED TO BE ADDED TO THE INSTALLER AND THE README
