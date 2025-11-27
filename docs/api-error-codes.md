# API & Discord Error Codes

The backend reports structured error codes for common Discord workflows. Surface these codes to operators so they can fix misconfiguration quickly.

## Ticket commands

| Code | Meaning | Resolution |
| --- | --- | --- |
| `no_workspace_server` | The `/ticket` command ran in a guild that is not linked to any workspace. | Update the server settings so its **Guild ID** matches the guild where the command is used. |
| `ambiguous_workspace_server` | Multiple servers share the same guild and the `/ticket` command did not specify the `server` option. | Re-run the command with the `server` option. |
| `ticketing_disabled` | Ticketing is turned off in the Discord config. | Run `/ticket config toggle enabled:true`. |
| `missing_ticket_category` | No Discord category is configured for new ticket channels. | Run `/ticket config setcategory …` from the guild. |
| `channel_guild_mismatch` | The configured panel/log channel belongs to a different guild. | Update the guild/channel IDs in the workspace settings so they point to the same guild. |

## REST responses

Whenever these conditions occur, JSON responses include both an `error` field (for machines) and a human-readable `message` so the UI can display actionable instructions.
