# GroupManagementBot

A Discord bot (TypeScript, discord.js v14, noblox.js) that lets officers of a
Napoleonic-Wars-style Roblox guild manage two Roblox groups from Discord:

- **Empire Français (EF)** — Roblox group `5610765`, the main group.
- **Neuvième Corps** — Roblox group `13206132`, the corps group.

The bot links Discord users to their Roblox accounts through Bloxlink, ranks
members in either group (with automatic EF → Corps rank sync), sends event DMs
with an optional attendance poll, and shows player stats fed by officers'
Google Sheets.

## Commands

| Command | Access | What it does |
|---------|--------|--------------|
| `/ping` | public | Replies with "Pong!" to confirm the bot is alive. |
| `/accept` | configurable | Accepts a member's pending join request into both managed groups. |
| `/whois` | configurable | Shows a player's Roblox info and ranks (by Discord user or Roblox username). |
| `Roblox Info` (right-click) | configurable | The same info as `/whois` for the selected member. |
| `/rank` | configurable | Sets a member's rank in a group; from EF it also syncs the Corps rank. |
| `/eventdm` | configurable | DMs an event notice to the most active members of a role, with an optional attendance poll. |
| `/eventdm-exclusions` | configurable | Manages roles that never receive event DMs. |
| `/userinfo` | configurable | Shows a player's stats card and group ranks. |
| `/stats-source` | configurable | Manages Google Sheet stats sources and their display fields. |
| `/stats-alias` | configurable | Manages a player's manual sheet-name aliases. |
| `/permissions` | admin | Manages which roles may run each configurable command. |

**Access levels:**

- **public** — anyone may run it.
- **configurable** — only roles an admin has allowed. With no roles set, only
  Discord Administrators may run it (fail-closed). Add the `@everyone` role to
  open a command to all members.
- **admin** — Discord Administrators only; never configurable (`/permissions`).

## First-time setup after deploying

1. Register the slash commands (see below).
2. As a Discord Administrator, grant access to the trusted roles, for example:
   - `/permissions add command:rank role:@Officers`
   - Repeat for `accept`, `eventdm`, `userinfo`, and the other configurable
     commands you want those roles to use.
   Until you do this, only Administrators can run configurable commands.

## Rank sync (Empire Français → Neuvième Corps)

When `/rank` changes a member's rank in Empire Français (and `sync-corps` is on,
which is the default), the bot looks up the new EF rank number in the **Rank
Sync Table** and sets the matching Neuvième Corps rank.

- The table lives in **`src/config/rankSync.ts`** and is the only place to edit
  the mapping. It is data only — no logic.
- EF ranks are matched by **rank number**; Corps ranks are matched by **role
  name**, so the sync keeps working whatever rank numbers the Corps group uses.
- Current mapping:
  - Citoyen–Caporal Fourrier (EF 1–5) → **Militaire du Rang**
  - Sergent–Adjudant Sous-Officier (EF 6–9) → **Sous-Officier**
  - Sous-Lieutenant–Capitaine (EF 11–13) → **Officier Subalterne**
  - Chef de Bataillon–Colonel (EF 14–16) → **Officier Supérieur**
  - Bénéficiaire d'Empire (EF 10, retired officers) and ranks above Colonel
    (EF 17+) have **no rule** — the Corps rank is left unchanged, since those
    Corps appointments are made manually.
- On startup the bot checks the table for overlapping or invalid ranges and for
  Corps role names missing from the Corps group, logging a warning for each
  problem without stopping.

Sync runs one way only: ranking someone directly in Neuvième Corps never changes
their Empire Français rank. If a member is not in the Corps, the sync is skipped
(the bot never auto-accepts them). If a Corps sync fails, the EF change is kept.

## Event DMs and exclusions

`/eventdm` opens a form for a title and message, then shows a preview (recipient
counts and the exact DM) before anything is sent. On confirm it DMs the most
recently active members of the role, one at a time, skipping bots, the sender,
and any member holding an excluded role.

- Manage the never-DM roles with `/eventdm-exclusions add|remove|list`.
- Supplying a `results-channel` adds **Attending / Maybe / Can't attend** buttons
  to each DM and posts a live tally in that channel. Polls stay open for 72
  hours and keep working after a restart.

Member activity (who to prioritise) is tracked from messages, voice joins, and
command use. Only user IDs and timestamps are stored — never message content.

## Player stats (Google Sheets)

`/userinfo` shows a player's stats in a card. Stats come from one or more
**Stats Sources**, each a Google Sheet with a small web endpoint an officer
creates inside their own sheet.

> Connecting a sheet requires an officer-created Google Apps Script endpoint that
> returns one player's row as JSON. Writing and deploying that script is
> **documented separately and is outside this bot's code.** The bot only calls
> the endpoint.

- Add a source with `/stats-source add` (a form collects the endpoint URL and
  secret so they are never typed into a channel). The bot test-calls the endpoint
  and saves the source only if the call succeeds.
- Choose which columns appear with `/stats-source field-add`,
  `field-add-ratio`, `field-remove`, `field-move`, and `field-list`.
- The bot searches by Roblox user ID, trying the current username, previous
  usernames, then manual aliases (`/stats-alias`), so a renamed player is still
  found.
- Secrets and full endpoint URLs are never shown or logged; only the URL host is
  displayed.

## Data storage

Runtime data is kept in three JSON files in a **`data/`** folder
(`settings.json`, `events.json`, `activity.json`). The folder path can be
overridden with the `DATA_DIR` environment variable.

- **`data/` is git-ignored and must not be deleted or overwritten by a
  deployment.** It holds permissions, exclusions, stats sources, saved polls, and
  activity history. The CD step only copies build output and never touches
  `data/`, so it survives redeploys.
- `settings.json` and `events.json` refuse to start the bot if they cannot be
  parsed (they are never overwritten). A corrupt `activity.json` is set aside and
  reset, because losing activity history is harmless.

## Development

```bash
npm install            # install dependencies
npm run typecheck      # tsc --noEmit
npm run tests          # vitest (via dotenvx, decrypts .env.ci)
npm run build          # bundle dist/main.js with tsup
npm run dev            # run locally with tsx watch
```

Tests need no network and no real secrets — external calls (Bloxlink, Roblox,
Google Sheet endpoints, Discord) are replaced with fakes.

## Registering slash commands

Slash commands are **not** registered automatically. After changing any command
definition, the owner runs this once (it uses `dotenvx` to decrypt `.env.ci`):

```bash
npm run deploy-commands
```

## Secrets

Secrets live in the dotenvx-encrypted `.env.ci` (Discord token and client ID,
Roblox cookie, Bloxlink key). Never edit `.env.ci` by hand and never commit
`.env.keys`. If a new secret is ever needed, add it with `dotenvx set` rather
than editing the file directly.

## Deployment

GitHub Actions runs CI on `release/**` and on pull requests (typecheck + tests),
then deploys to an AWS EC2 instance with pm2. pm2 sends `SIGINT` on stop/restart;
the bot saves any unsaved activity before exiting.
