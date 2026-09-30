# GroupManagementBot

A Discord bot (TypeScript, discord.js v14, noblox.js) that lets officers of a
Napoleonic-Wars-style Roblox guild manage two Roblox groups from Discord:

- **Empire Français (EF)** — Roblox group `5610765`, the main group.
- **Neuvième Corps** — Roblox group `13206132`, the corps group.

The bot links Discord users to their Roblox accounts through Bloxlink, ranks
members in either group (with automatic EF → Corps rank sync **and** Discord
rank-role sync), sends event DMs with an optional attendance poll, shows a
player info card fed by officers' Google Sheets, and logs every command run to a
channel of your choice. Slash-command descriptions are localized in English and
Chinese Simplified.

This bot was made possible by using the AWS Kiro agent.

## Commands

| Command | Access | What it does |
|---------|--------|--------------|
| `/ping` | public | Replies with "Pong!" to confirm the bot is alive. |
| `/accept` | configurable | Accepts a member's pending join request into both managed groups. |
| `/whois` | configurable | Shows a player's Roblox info and ranks (by Discord user or Roblox username). |
| `Roblox Info` (right-click) | configurable | The same info as `/whois` for the selected member. |
| `/rank` | configurable | Sets a member's rank in a group; from EF it also syncs the Corps rank and the Discord rank role. |
| `/eventdm` | configurable | DMs an event notice to the most active members of a role, with an optional attendance poll. |
| `/eventdm-exclusions` | configurable | Manages roles that never receive event DMs. |
| `/userinfo` | configurable | Shows a player's info card: ranks, assignments, regiments, and per-source stat tables. |
| `/stats-source` | configurable | Manages Google Sheet stats sources and their display fields. |
| `/stats-alias` | configurable | Manages a player's manual sheet-name aliases. |
| `/roles` | configurable | Manages the regiment, special-assignment, and imperial-honour roles shown on `/userinfo`. |
| `/permissions` | admin | Manages which roles may run each configurable command. |
| `/log` | admin | Sets or shows the channel that command runs are logged to. |

**Access levels:**

- **public** — anyone may run it.
- **configurable** — only roles an admin has allowed. With no roles set, only
  Discord Administrators may run it (fail-closed). Add the `@everyone` role to
  open a command to all members.
- **admin** — Discord Administrators only; never configurable (`/permissions`,
  `/log`). These commands also set their Discord default member permissions to
  Administrator, so Discord hides them from non-administrators in the UI (the
  runtime check remains the authoritative gate).

**Reply visibility:** read-only information commands (`/userinfo`, `/whois`,
"Roblox Info") reply **publicly** so everyone in the channel can see them.
Commands that change or configure things reply **ephemerally** (only the runner
sees them), since the result is visible through the information commands.
Previews, confirmations, permission refusals, and errors are always ephemeral.

## First-time setup after deploying

1. Register the slash commands (see below).
2. As a Discord Administrator, grant access to the trusted roles, for example:
   - `/permissions add command:rank role:@Officers`
   - Repeat for `accept`, `eventdm`, `userinfo`, `roles`, and the other
     configurable commands you want those roles to use.
   Until you do this, only Administrators can run configurable commands.
3. Set the log channel with `/log set channel:#command-log` so command runs are
   recorded (optional but recommended — see "Command logging" below).
4. Configure the special-assignment and regiment roles with `/roles` so they
   appear on `/userinfo` (see "Player info card" below).

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

**Officers cannot rank themselves.** `/rank` refuses when the target is the
officer running it, so no one can self-promote or self-demote. (Alternate
accounts are outside what the bot can detect and must be handled through vetting.)

### Discord rank role

An Empire Français rank change also updates the member's **Discord** rank role:
the bot adds the role that maps to the new rank and removes any other rank role
in the managed set, touching no other roles. This is done directly by the bot
(not through Bloxlink) so it happens immediately.

- The EF-rank → Discord-role map lives in **`src/config/rankRoles.ts`** (data
  only). It covers Citoyen (1) through Colonel (16); rank 10 (Bénéficiaire
  d'Empire) and ranks above Colonel are intentionally unmapped and left to
  manual assignment.
- If the Discord role update fails (the bot lacks Manage Roles, is below the
  role in the hierarchy, or the role was deleted), the Roblox rank change is
  still kept and the reply says the Discord role could not be updated. Make sure
  the bot's role sits **above** every rank role and has **Manage Roles**.

## Event DMs and exclusions

`/eventdm` opens a form for a title and message, then shows a preview (recipient
counts and the exact DM) before anything is sent. On confirm it DMs the most
recently active members of the role, one at a time, skipping bots, the sender,
and any member holding an excluded role.

- Manage the never-DM roles with `/eventdm-exclusions add|remove|list`.
- Supplying a `results-channel` adds **Attending / Maybe / Can't attend** buttons
  to each DM and posts a live tally in that channel. Polls stay open for 72
  hours and keep working after a restart.
- **Rate limit and auto-blacklist.** Each officer may confirm at most **5
  broadcasts per 24 hours** (rolling; unconfirmed previews don't count). The
  6th trips a safeguard: the officer is added to a persisted blacklist, is
  refused further `/eventdm` use, and the bot posts one `@everyone` alert in the
  log channel naming them — the only place the bot ever pings `@everyone`.
  Removal is manual (an admin edits `eventDmBlacklist` in `settings.json`). The
  limit and window live in `src/config/constants.ts`.

Member activity (who to prioritise) is tracked from messages, voice joins, and
command use. Only user IDs and timestamps are stored — never message content.

## Player info card (`/userinfo`)

`/userinfo` shows one embed laid out like a grid:

- the player's Roblox avatar as the thumbnail;
- a vertical list, in order: Empire Français rank, Neuvième Corps rank,
  regiment(s), special assignments, and imperial honours. The last three render
  as bullet-point lists;
- one small table per Stats Source the player appears in, titled with the
  source's display name, with a header row of column labels and a single data
  row for that player. Players found in several sheets get one table each.

### Regiments, special assignments, and imperial honours

`/userinfo` shows the labels of any configured Discord roles the member holds,
across three lists managed with `/roles`:

- **Regiments** — `/roles regiment add|remove|list`. A member may hold several.
- **Special assignments** — `/roles special-assignment add|remove|list` (one-off
  roles like Eagle Bearer or Regimental Drummer).
- **Imperial honours** — `/roles imperial-honour add|remove|list`.
- When adding, the label defaults to the Discord role's name; pass a `label` to
  override it, and an optional `emoji` (unicode or a custom `<:name:id>`) to show
  before the label (for example `- 🦅 Porte-Aigle`). The lists are stored in
  settings and apply to the next `/userinfo` without a restart. A member with
  none in a section shows "None".

### Stats sources (Google Sheets)

Stats come from one or more **Stats Sources**, each a Google Sheet with a small
web endpoint an officer creates inside their own sheet.

> Connecting a sheet requires an officer-created Google Apps Script endpoint that
> returns one player's row as JSON. Writing and deploying that script is
> **documented separately and is outside this bot's code.** The bot only calls
> the endpoint.

- Add a source with `/stats-source add` (a form collects the endpoint URL and
  secret so they are never typed into a channel). The `name` you give the source
  is the title shown above its table on the card. The bot test-calls the endpoint
  and saves the source only if the call succeeds.
- Choose which columns appear with `/stats-source field-add`,
  `field-add-ratio`, `field-remove`, `field-move`, and `field-list`.
- The bot searches by Roblox user ID, trying the current username, previous
  usernames, then manual aliases (`/stats-alias`), so a renamed player is still
  found.
- Secrets and full endpoint URLs are never shown or logged; only the URL host is
  displayed.

## Command logging

Set a log channel with `/log set channel:#command-log`; check the current one
with `/log show`. Once set, the bot posts one entry per command run with the
command name, who ran it, where, the time, and a summary of the options.

- **`/eventdm` is logged in full** — the role, recipient counts, results
  channel, and the exact title and message that were sent — so a rule-breaking
  message can be traced to its sender.
- True secrets (endpoint URLs and secrets, tokens) are never logged.
- The log channel can be shared with other logging bots (for example Dyno); the
  bot only posts to it and never manages it. Logging never mentions anyone,
  never blocks a command, and is skipped silently if no channel is set or the
  channel is unreachable.

## Appearance (theme)

The look of the **fixed** embeds is collected in **`src/config/theme.ts`** (data
only) so you can beautify them without touching logic:

- accent colours per embed type (success, warning, error, info, the `/userinfo`
  card, the poll summary, the event-DM embed);
- the title icons on success/warning/error embeds and the poll answer icons;
- the section emojis on the `/userinfo` card (before the EF rank, Corps rank,
  regiments, special assignments, and imperial honours headings). Set one to an
  empty string for no emoji.

Editing that file changes the look with no other code changes. The dynamic stats
tables are intentionally **not** themed here; the per-role emojis in the three
role lists come from `/roles`, not the theme.

## Localization

Slash-command **descriptions** (command and option descriptions) are localized
through Discord's native localization, sourced from **`src/i18n/localizations.ts`**.
English is the default; Chinese Simplified (`zh-CN`) is provided, and Discord
falls back to English wherever a translation is missing.

- Add another Discord-supported locale by adding its entries in that file — no
  logic changes. (Tagalog is not a Discord locale, so it cannot be added.)
- Command **names**, modal titles/labels, button labels, embed and reply
  content, and sheet data are not localized (Discord cannot localize the latter
  three, and localizing command names would change how members invoke them).
- Localizations are applied when commands are registered, so run
  `npm run deploy-commands` after editing the localization files.

## Data storage

Runtime data is kept in three JSON files in a **`data/`** folder
(`settings.json`, `events.json`, `activity.json`). The folder path can be
overridden with the `DATA_DIR` environment variable.

- **`data/` is git-ignored and must not be deleted or overwritten by a
  deployment.** It holds permissions, exclusions, stats sources, special-assignment
  and regiment role lists, the log channel, saved polls, and activity history.
  The CD step only copies build output and never touches `data/`, so it survives
  redeploys.
- `settings.json` and `events.json` refuse to start the bot if they cannot be
  parsed (they are never overwritten). A corrupt `activity.json` is set aside and
  reset, because losing activity history is harmless.

## Development

```bash
npm install --ignore-scripts   # install dependencies
npm run typecheck              # tsc --noEmit
npm run tests                  # vitest (via dotenvx, decrypts .env.ci)
npm run build                  # bundle dist/main.js with tsup
npm run dev                    # run locally with tsx watch
```

Install with `--ignore-scripts`: noblox.js has a decorative `postinstall` figlet
banner that can crash on a missing font and is not needed at runtime. CI and CD
use the same flag.

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
