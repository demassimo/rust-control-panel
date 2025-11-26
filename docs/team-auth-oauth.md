# Configuring Discord and Steam OAuth for team authentication

The control panel's team-authentication flow links each player's Steam account to their Discord identity so staff can spot alternate accounts. This guide walks you through provisioning both providers and wiring the required environment variables so `/request.html` can finish the linking workflow.

## Prerequisites

Before touching either provider, make sure the panel can build correct public URLs:

- Set `PANEL_PUBLIC_URL` to the externally reachable base URL for the backend (for example `https://panel.example.com`). The backend uses this value when it needs to embed absolute links in Discord notifications and OAuth redirects.【F:README.md†L55-L74】
- If you host the static frontend separately, set `TEAM_AUTH_APP_URL` to the public origin that serves `request.html`. When this variable is left empty the backend links directly to `/request.html` on the same origin.【F:backend/src/index.js†L63-L312】【F:backend/src/index.js†L5306-L5313】
- Configure `TEAM_AUTH_STATE_SECRET` with a long random string so OAuth state tokens remain valid across restarts. When the value is missing the server falls back to a transient secret derived from `JWT_SECRET`, which will invalidate in-flight requests whenever the process restarts.【F:backend/src/index.js†L131-L141】

Once those values are in place, restart the backend so it reads the updated configuration.

## Discord OAuth configuration

1. Create or select an application in the [Discord Developer Portal](https://discord.com/developers/applications).
2. Under **OAuth2 → General**, add the panel's callback URL (`https://panel.example.com/api/auth/discord/callback` unless you customise it in the next step) to the **Redirects** list.
3. Copy the **Client ID** and **Client Secret** from the same page.
4. In the backend environment configure:
   - `DISCORD_OAUTH_CLIENT_ID`
   - `DISCORD_OAUTH_CLIENT_SECRET`
   - `DISCORD_OAUTH_REDIRECT_URI` (optional — defaults to `https://<host>/api/auth/discord/callback` when omitted).【F:backend/src/index.js†L142-L150】【F:backend/src/index.js†L5288-L5292】
5. Restart the backend after saving the environment changes.

During the linking flow the backend redirects players to Discord with the `identify` scope and validates the callback before storing the Discord snowflake in a signed cookie. If the application cannot reach the Discord API, or if the client ID/secret are missing, the `/api/auth/discord/*` routes short-circuit with `discord_unavailable` errors, so double-check the variables above whenever the flow fails immediately.【F:backend/src/index.js†L6267-L6397】

## Steam OpenID configuration

Steam uses OpenID rather than a traditional OAuth app registration, so you only need to ensure Steam can send callbacks to your panel.

1. Confirm the public callback URL that Steam should target (`https://panel.example.com/api/auth/steam/callback` by default).
2. If the backend is running behind a proxy that rewrites scheme or host headers, set:
   - `STEAM_OPENID_RETURN_URL` to the exact callback URL.
   - `STEAM_OPENID_REALM` to the public origin you expect Steam to trust.【F:backend/src/index.js†L151-L156】【F:backend/src/index.js†L5294-L5304】
3. Restart the backend so the new values take effect.

When a player chooses the Steam option the backend issues an OpenID request, validates the signed response with Steam, and extracts the 64-bit SteamID from `openid.claimed_id`. Any mismatch or verification failure is surfaced back to `/request.html` via `steam_error` codes. If you see `steam_unreachable` errors, verify outbound HTTPS requests to `steamcommunity.com` are allowed from your host.【F:backend/src/index.js†L6400-L6524】

## Verifying the flow end-to-end

1. As an administrator, create a new team-auth request from **Team access → Invite teammate** (the current UI entry point for account linking) to generate a `/request.html?token=...` link.
2. Open the link in an incognito window and complete the Discord login. You should be redirected back with a `discord_status=linked` parameter and a `team_auth_session` cookie.
3. Repeat for Steam — the page should now show `steam_status=linked`.
   - While the request page is open, the backend inspects the persistent cookie and responds with a `cookieMatches` array so staff can review any other Discord/Steam identities that used the same browser before completing the link.【F:backend/src/index.js†L6690-L6745】【F:backend/src/index.js†L5495-L5566】
4. Submit the SteamID64 form to finish the request. The backend verifies both sessions, links the Discord snowflake to the SteamID64 for alt-account discovery, and clears the temporary cookies before marking the linking record complete.【F:backend/src/index.js†L6525-L6664】

If any step fails, inspect the query parameters appended to the return URL for specific error codes and review the backend logs for detailed traces.
