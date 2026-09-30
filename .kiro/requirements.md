# Requirements Document

## Introduction

GroupManagementBot is a Discord bot (TypeScript, discord.js v14, noblox.js) that lets officers of a
Napoleonic-Wars-style Roblox guild manage two Roblox groups from Discord. It is deployed by GitHub Actions to
an AWS EC2 instance (pm2) and uses dotenvx-encrypted environment files.

**Today the bot can:** reply to `/ping`, and `/accept` a Discord user into both Roblox groups (it finds the
Roblox account through the Bloxlink API).

**This spec adds:** flexible group ranking with automatic Empire Français → Neuvième Corps rank sync, polished
lookup commands, activity-based event DMs with an optional attendance poll, configurable command permissions,
and a configurable stats card fed by officers' Google Sheets.

### Glossary

- **Empire Français (EF)**: Roblox group `5610765`, the main group.
- **Neuvième Corps**: Roblox group `13206132`, the corps group.
- **Managed Groups**: exactly the two groups above. No other group may ever be acted on.
- **Officer**: a Discord member trusted to run management commands.
- **Bloxlink**: third-party API that maps a Discord user ID to a Roblox user ID.
- **Rank Sync Table**: a table in the code that maps ranges of EF rank numbers to a Neuvième Corps rank name.
- **Stats Source**: one configured Google Sheet table (usually one per regiment or company).
- **Stats Endpoint**: a small web endpoint, created by an officer inside their own Google Sheet, that returns one
  player's row as JSON. Creating that endpoint is outside this spec; the bot only calls it.
- **Settings Store**: the JSON file where the bot keeps permissions, exclusions, stats sources and aliases.
- **Access level**: `public` (anyone), `configurable` (only roles an admin allowed), `admin` (Discord
  Administrators only, never configurable).
- **Eligible member**: a member of the target role who is not a bot, not the sender, and holds no excluded role.

### Assumptions

- The bot serves one Discord server (`DISCORD_SERVER_ID` = `1195572029412364408`, exposed via `init.ts`).
- The bot's Roblox account already holds a rank high enough in both groups to rank people.
- The rank numbers and Corps rank names in the Rank Sync Table are confirmed by the owner (see the Rank Sync
  Table in `design.md`); they remain editable in one file (`src/config/rankSync.ts`).
- "Latest active" means most recent Discord activity seen by the bot (messages, voice joins, command use),
  because Discord does not expose a "last seen" value. Tracking starts when the feature is deployed.

### Out of scope for this spec

- Writing or deploying the Google Apps Script that officers paste into their sheets.
- Registering slash commands with Discord (`npm run deploy-commands` is run manually by the owner).
- Any change to `.env.ci` or the encrypted secrets.

---

## Requirements

### Requirement 1: Shared lookup layer and clean code structure

**User Story:** As the maintainer, I want every external call and repeated behaviour in one small, named place,
so that new commands stay short and easy to read.

#### Acceptance Criteria

1. WHEN any command needs a Roblox account for a Discord user THEN the system SHALL use one shared lookup
   function instead of calling Bloxlink from the command file.
2. IF a Bloxlink lookup fails THEN the system SHALL return a typed reason (not linked, service error, or
   timeout) so the command can show a specific message.
3. WHEN the system calls Bloxlink, Roblox username history, or a Stats Endpoint THEN it SHALL stop waiting
   after 8 seconds.
4. WHEN the same Discord user is looked up again within 5 minutes THEN the system SHALL reuse the cached
   Roblox ID, and the cache SHALL hold at most 200 entries.
5. WHEN a command or interaction handler throws an unexpected error THEN the central router SHALL log it and
   reply with a generic ephemeral error message.
6. WHEN new code is added THEN the system SHALL keep one command per file in `src/commands/`, external calls
   in `src/api/`, and business logic in `src/services/`.

### Requirement 2: Convenient, polished command experience

**User Story:** As an officer, I want to run commands without hunting for anyone's Roblox account, so that
common tasks take one command.

#### Acceptance Criteria

1. WHEN an officer supplies a Discord user to any command THEN the system SHALL resolve their Roblox account
   automatically and show the Roblox username, ID and profile link in the reply.
2. IF the Discord user is not linked in Bloxlink THEN the system SHALL say so and tell the officer that the
   player must verify with Bloxlink, instead of showing a raw error.
3. WHEN an officer runs `/whois` with a Discord user or a Roblox username THEN the system SHALL show the Roblox
   username, user ID, profile link, avatar headshot, and rank name in each Managed Group.
4. WHEN an officer right-clicks a member and chooses the "Roblox Info" app THEN the system SHALL show the same
   information as `/whois`.
5. WHEN a command shows user information (for example `/userinfo`, `/whois`, the "Roblox Info" context menu)
   THEN the system SHALL reply publicly (not ephemerally) so everyone in the channel can see it.
5a. WHEN a command changes user information (for example `/accept`, `/rank`) or manages configuration (for
   example `/permissions`, `/stats-source`, `/stats-alias`, `/eventdm-exclusions`, `/roles`) THEN the system
   MAY reply ephemerally, because the resulting change can be viewed publicly through the information commands.
5b. WHEN a preview, confirmation, permission refusal, or generic error is shown THEN the system SHALL reply
   ephemerally regardless of the command type.
6. WHEN the system replies to a command THEN it SHALL use Discord embeds with one consistent look (colour,
   footer, success/warning/failure icons) built by a shared helper.
7. WHEN `/accept` or `/rank` changes something in Roblox THEN the reply SHALL show what changed (for example
   "Sergent → Adjudant in Empire Français"), including any Discord rank-role change (Requirement 3.17), and
   which officer did it.
8. WHEN an officer runs `/accept` THEN the system SHALL keep the current behaviour (accept into both Managed
   Groups when a join request is pending, otherwise report already-a-member or no-request) and SHALL send one
   combined reply instead of repeatedly re-reading and appending to the previous message.

### Requirement 3: Flexible ranking with Empire Français → Neuvième Corps sync

**User Story:** As an authorised officer, I want to set any rank in either group from one command, and have
the corps rank follow the main-group rank automatically, so that I never have to open the Roblox website or
rank people twice.

#### Acceptance Criteria

1. WHEN an officer runs `/rank` with `user`, `group` and `rank` THEN the system SHALL set that member's rank in
   the chosen group.
2. WHEN the officer fills in the `group` option THEN the system SHALL offer only Empire Français and Neuvième
   Corps, and SHALL NOT accept a typed group ID anywhere.
3. WHEN the officer types in the `rank` option THEN the system SHALL offer autocomplete of that group's real
   rank names, fetched from Roblox, cached for 5 minutes, and limited to 25 suggestions.
4. IF the target is not a member of the chosen group THEN the system SHALL refuse and suggest `/accept`.
5. IF the requested rank is the guest rank (0), the owner rank (255), or at or above the bot's own rank in that
   group THEN the system SHALL refuse with a plain explanation.
6. IF the target's current rank is at or above the bot's own rank THEN the system SHALL refuse.
7. IF the target already holds the requested rank THEN the system SHALL say so and change nothing.
8. WHEN a rank change in Empire Français succeeds AND the optional `sync-corps` option is on (default on) THEN
   the system SHALL find the rule in the Rank Sync Table that contains the new EF rank number and set the
   member's Neuvième Corps rank to that rule's Corps rank.
9. IF the new EF rank matches no rule in the Rank Sync Table THEN the system SHALL leave the Corps rank
   unchanged and say that no sync rule applies.
10. IF the member is not in Neuvième Corps THEN the system SHALL skip the sync, say so, and SHALL NOT accept
    them into the Corps automatically.
11. IF the matching Corps rank does not exist in the Corps group or the bot may not assign it THEN the system
    SHALL keep the EF change, report that the Corps sync failed and why, and SHALL NOT undo the EF change.
12. WHEN an officer ranks someone directly in Neuvième Corps THEN the system SHALL NOT change their
    Empire Français rank (sync runs one way only).
13. WHEN a rank change finishes THEN the reply SHALL show old and new rank for each group touched and the
    officer who ran it, and the console SHALL log the same line.
14. WHEN the bot starts THEN the system SHALL check the Rank Sync Table for overlapping or invalid ranges and
    for Corps rank names missing from the Corps group, and SHALL log a warning for each problem without
    stopping the bot.
15. WHEN any officer adjusts the mapping THEN the change SHALL be made only by editing the single Rank Sync
    Table file (data only, no logic in that file).
16. WHEN a member runs `/rank` THEN the system SHALL require the `configurable` access level (see Requirement 8).
17. WHEN a rank change in Empire Français succeeds THEN the system SHALL update the member's **Discord** rank
    role: it SHALL add the Discord role that maps to the new EF rank and remove any other Discord role in the
    managed rank-role set, and SHALL NOT add, remove, or reorder any Discord role outside that set.
18. WHEN the new EF rank has no mapped Discord role (ranks above Colonel, handled manually) THEN the system
    SHALL leave the member's Discord roles unchanged and say the Discord rank role was not changed.
19. WHEN the managed rank-role set is defined THEN it SHALL live in a single data-only file (like the Rank Sync
    Table) mapping each EF rank number to a Discord role ID, so it is easy to edit without touching logic.
20. IF the Discord rank role cannot be changed (the role no longer exists, or the bot lacks Manage Roles or is
    below the role in the hierarchy) THEN the system SHALL keep the Roblox rank change, report that the Discord
    role update failed and why, and SHALL NOT undo the Roblox change.
21. WHEN the Discord rank role is synced THEN the system SHALL do this directly (add new role, remove old
    managed rank roles) rather than relying on Bloxlink's own role sync, so it fires immediately and never
    touches unmanaged roles.
22. IF the officer targets themselves (the `user` option resolves to the officer running the command) THEN the
    system SHALL refuse before making any Roblox or Discord change and say that officers cannot change their
    own rank, so that no one can self-promote or self-demote. (Alt accounts are out of scope for the bot and
    must be handled organisationally through vetting.)

### Requirement 4: Event notice DMs to a role, with confirmation

**User Story:** As an officer, I want to send an event notice by DM to the most active members of a role,
skipping staff, without turning the announcement channel into a broadcast channel and without any risk of
mass-DMing by accident.

#### Acceptance Criteria

1. WHEN an officer runs `/eventdm` with a `role`, an optional `limit` (1 to 250, default 250) and an optional
   `results-channel` THEN the system SHALL open a modal asking for a title (max 100 characters) and a
   multi-line message (max 1500 characters).
2. IF a `results-channel` is supplied AND it is not a text channel of the server the bot can send embeds in
   THEN the system SHALL refuse before opening the modal and say what is wrong.
3. WHEN the modal is submitted THEN the system SHALL NOT send any DM yet; it SHALL show an ephemeral preview
   with the exact DM as recipients will see it, the role name, the number of eligible members, the number
   excluded, the number who will receive it, whether an attendance poll is included, and **Confirm** and
   **Cancel** buttons.
4. WHEN the system builds the recipient list THEN it SHALL first remove bots, the sending officer, and every
   member holding an excluded role (Requirement 6), THEN sort the remaining members from most to least
   recently active (Requirement 7), THEN keep only the first `limit` members, so that excluded members never
   use up sending capacity.
5. IF a member has no recorded activity THEN the system SHALL place them after all members who have activity,
   ordered by most recent server join date.
6. IF there are zero recipients THEN the system SHALL say so and SHALL NOT offer a Confirm button.
7. WHEN anyone other than the officer who created the preview presses a button THEN the system SHALL ignore
   the press and tell them privately that the prompt is not theirs.
8. WHEN a preview has been open for 5 minutes THEN the system SHALL expire it and disable its buttons.
9. WHEN Confirm is pressed THEN the system SHALL send the DMs one at a time with a short pause between each,
   SHALL update a progress message at intervals, and SHALL NOT block other commands while sending.
10. IF a recipient has DMs closed or sending fails THEN the system SHALL continue with the remaining
    recipients.
11. WHEN sending finishes THEN the system SHALL show a summary with the number sent, the number failed, and
    the display names of failed recipients (truncated to fit Discord limits).
12. WHILE a broadcast is sending in the server THEN the system SHALL refuse to start another one, and WHEN one
    has finished THEN the system SHALL refuse a new one for 5 minutes.
13. WHEN a DM is sent THEN it SHALL be an embed showing the title, the message, the sending officer's display
    name and the server name, and SHALL NOT create mentions or pings.
14. WHEN a member runs `/eventdm` THEN the system SHALL require the `configurable` access level.
15. WHEN an officer confirms a broadcast THEN the system SHALL count it toward a rolling per-officer rate limit
    of at most 5 confirmed broadcasts per 24 hours (both numbers configurable in one constants file). Previews
    that are never confirmed SHALL NOT count.
16. IF confirming a broadcast makes the officer exceed the rate limit THEN the system SHALL add that officer to
    a persisted per-command blacklist (stored in the settings file so it survives restarts), and SHALL post a
    single warning in the configured log channel that pings `@everyone` and names the officer, so that
    administrators are alerted to the misuse. This is the only place the bot is permitted to mention
    `@everyone`.
17. IF a blacklisted officer runs `/eventdm` THEN the system SHALL refuse before building any recipient list or
    sending any DM, and say they are blacklisted and should contact an administrator. Removal from the
    blacklist is manual (an administrator edits the settings file).

### Requirement 5: Optional attendance poll inside the DM

**User Story:** As an officer, I want recipients to answer "attending or not" straight from the DM and see the
totals in a channel I choose, so that I know who is coming without reading replies.

#### Acceptance Criteria

1. WHEN `/eventdm` is run with a `results-channel` THEN each DM SHALL include three buttons: Attending, Maybe,
   and Can't attend.
2. WHEN `/eventdm` is run without a `results-channel` THEN the DM SHALL contain no buttons and no poll data
   SHALL be stored.
3. WHEN Confirm is pressed on a poll broadcast THEN the system SHALL post one summary embed in the results
   channel before sending starts, and SHALL keep that message ID.
4. WHEN a recipient presses a button THEN the system SHALL record their answer against their Discord user ID,
   replace any earlier answer from them, and update their DM to show "Your answer: …" while keeping the
   buttons usable until the poll closes.
5. WHEN an answer is recorded THEN the system SHALL edit the summary embed to show the count of each answer, the
   count who have not answered, the count whose DM failed, and up to 20 names per answer followed by
   "+N more", and SHALL edit the message at most once every 10 seconds per poll.
6. WHEN a poll has been open for 72 hours THEN the system SHALL treat it as closed, tell any later button
   presser that the poll is closed, and remove the buttons from their DM.
7. IF a user who was not a recipient of the poll presses a button THEN the system SHALL ignore the answer.
8. IF the summary message was deleted or the results channel is no longer reachable THEN the system SHALL log
   it, keep recording answers, and SHALL NOT crash.
9. WHEN the bot restarts THEN previously sent poll buttons SHALL still work, because polls are stored in a file.
10. WHEN polls are saved THEN the system SHALL keep at most 20 polls and delete polls older than 30 days.
11. WHEN a recipient presses a poll button in a DM THEN the system SHALL accept it even though it is not in the
    server, and SHALL NOT require a command permission for it.

### Requirement 6: Event DM exclusion list

**User Story:** As an admin, I want a changeable list of roles that never receive event DMs (such as
regimental staff), so that officers do not DM themselves and each other.

#### Acceptance Criteria

1. WHEN an officer runs `/eventdm-exclusions add` or `remove` with a role THEN the system SHALL add or remove
   that role in the exclusion list and save it.
2. WHEN an officer runs `/eventdm-exclusions list` THEN the system SHALL show the excluded roles, marking any
   role that no longer exists as "deleted role".
3. WHEN the exclusion list changes THEN the change SHALL apply to the very next `/eventdm` without a restart.
4. IF a role in the list has been deleted from the server THEN the system SHALL ignore it when selecting
   recipients.
5. WHEN a member runs `/eventdm-exclusions` THEN the system SHALL require the `configurable` access level.

### Requirement 7: Member activity tracking

**User Story:** As an officer, I want the bot to know who was recently active, so that event DMs go to the
people most likely to read them.

#### Acceptance Criteria

1. WHEN a non-bot member sends a message, joins or moves voice channels, or uses a bot command in the server
   THEN the system SHALL record the current time as that member's last activity.
2. WHEN the system records activity THEN it SHALL store only the user ID and a timestamp, and SHALL NOT read,
   store, or log message content.
3. WHEN activity is recorded THEN the system SHALL keep it in memory and save it to a file at most once every
   5 minutes, without a repeating timer.
4. WHEN the bot receives a stop signal (SIGINT or SIGTERM) THEN the system SHALL save any unsaved activity
   before exiting.
5. WHEN activity is saved THEN the system SHALL drop entries older than 90 days and keep at most 5000 entries.
6. IF the activity file is missing or unreadable at startup THEN the system SHALL start with empty activity and
   log a warning.
7. WHEN the bot requests permissions from Discord THEN the system SHALL only use the Guilds, GuildMembers,
   GuildMessages, and GuildVoiceStates intents (no message content or presence intents).

### Requirement 8: Command permission security

**User Story:** As a server admin, I want abusable commands limited to roles I choose and adjustable from
Discord, so that I can change who is trusted without redeploying the bot.

#### Acceptance Criteria

1. WHEN a command is written THEN it SHALL declare an access level (`public`, `configurable` or `admin`) in its
   own file.
2. IF a member holding none of a `configurable` command's allowed roles runs it THEN the system SHALL refuse
   with an ephemeral message and SHALL NOT run any of the command's logic.
3. WHILE a `configurable` command has no allowed roles set THEN the system SHALL allow only members with the
   Discord Administrator permission ("fail closed").
4. WHEN a member has the Discord Administrator permission THEN the system SHALL allow every `configurable`
   command for them.
5. WHEN an admin runs `/permissions add`, `remove`, `list` or `reset` THEN the system SHALL change or show the
   allowed roles for a chosen command, where the command choice is an autocomplete of only `configurable`
   commands.
6. WHEN a member runs `/permissions` THEN the system SHALL require the `admin` access level, and it SHALL NOT be
   configurable.
6a. WHEN an `admin`-only command is registered with Discord (currently `/permissions` and `/log`) THEN it SHALL
    set its default member permissions to Administrator, so Discord hides it from non-administrators in the UI
    as defence in depth. The runtime access check (criteria 2–4) remains the authoritative gate.
7. WHEN the `@everyone` role is added to a command THEN the system SHALL treat that command as open to all
   members.
8. WHEN permissions change THEN the system SHALL save them immediately, and the change SHALL apply to the very
   next command without restarting the bot.
9. IF a role in a permission list has been deleted THEN `/permissions list` SHALL show it as "deleted role" and
   the system SHALL ignore it during checks.
10. WHEN a button, modal or autocomplete belongs to a `configurable` command THEN the system SHALL apply the same
    permission check as for that command, except for the poll buttons in Requirement 5.
11. WHEN a `configurable` or `admin` command is allowed or denied THEN the system SHOULD write one console log
    line (time, user ID, command, result) that contains no secrets.

### Requirement 9: Managing stats sources

**User Story:** As an officer, I want to connect a sheet, tell the bot where its table is, and choose which
columns to show, so that when our sheet changes I can update the bot from Discord.

#### Acceptance Criteria

1. WHEN an officer runs `/stats-source add` with a name, tab name, header row number, username column header,
   and optional start column THEN the system SHALL open a modal for the Stats Endpoint URL and secret, so the
   secret is never typed into a channel message.
2. IF a Stats Endpoint URL is not an `https://script.google.com/` or `https://script.googleusercontent.com/`
   address THEN the system SHALL reject it.
3. WHEN the modal is submitted THEN the system SHALL make a test call to the endpoint and SHALL save the source
   only if the call succeeds, otherwise explain which part failed (bad secret, tab not found, header not
   found, unreachable).
4. WHEN an officer runs `/stats-source list`, `remove`, `edit`, or `test` THEN the system SHALL show, delete,
   change (tab, header row, start column, username header, accent colour, enabled), or test a source.
5. WHEN an officer runs `/stats-source field-add`, `field-add-ratio`, `field-remove`, `field-move`, or
   `field-list` THEN the system SHALL change or show which columns appear, in what order, with what display
   label, and whether the field is inline.
6. WHEN a field is defined THEN it SHALL support the formats `text`, `number` (thousands separators),
   `percent`, and a `ratio` calculated from two columns (for example Kills ÷ Deaths shown as `2.35`).
7. WHEN a secret or full endpoint URL would be displayed or logged THEN the system SHALL show or log nothing
   instead (only the URL host may be shown).
8. WHEN a member runs `/stats-source` THEN the system SHALL require the `configurable` access level.
9. IF a configured header no longer exists in the sheet THEN `/stats-source test` SHALL list exactly which
   headers are missing.

### Requirement 10: Player info card

**User Story:** As an officer or member, I want one command that shows a player's identity, roles, and
per-regiment stats in one professional card laid out like a grid, so that I can check who someone is and how
they are doing without opening the spreadsheets.

#### Card layout (single embed, grid-like)

The `/userinfo` reply is **one embed** arranged to read like a two-row grid:

- **Top row, left:** the player's Roblox avatar as the embed thumbnail. (Discord renders the thumbnail in the
  top corner of the embed; it is the closest native equivalent to a top-left photo.)
- **Top row, right:** a vertical information list in the embed description, in this exact order:
  1. rank in Empire Français,
  2. rank in Neuvième Corps,
  3. **Regiment(s)** — the member's roles from the configured regiment list (Requirement 16); may be several,
  4. **Special assignments** — the member's roles from the configured special-assignment list (Requirement 16),
  5. **Imperial Honours** — the member's roles from the configured imperial-honours list (Requirement 16).

  The regiment, special-assignment, and imperial-honour entries SHALL each render as a bullet-point list, one
  item per role, with the entry's configured emoji shown before its label when one is set (for example
  `- 🦅 Porte-Aigle`).
- **Bottom row (spans the full width):** one small table per Stats Source the player was found in. Each table
  is a field whose **name is the source's custom display name in bold** and whose value is a compact two-line
  table (a header row of column labels and a single data row for that player) rendered so the columns line up.
  Multiple matching sources appear as multiple tables stacked vertically.

#### Acceptance Criteria

1. WHEN a member runs `/userinfo` with a `user` and an optional `source` (autocomplete of source names) THEN
   the system SHALL look the player up in the chosen source.
2. IF `source` is omitted THEN the system SHALL query every enabled Stats Source, at most 3 at a time, and
   include one table for each source that contains the player.
3. WHEN the info card is built THEN it SHALL be a single embed containing the avatar thumbnail, the vertical
   information list in the order EF rank, Corps rank, regiments, special assignments, imperial honours, and one
   table per matching source.
4. WHEN a source table is rendered THEN its header row SHALL be the configured field labels in the configured
   order and its data row SHALL be that player's values; the table SHALL be titled with the source's custom
   display name in bold.
5. IF the player is found in no source THEN the system SHALL still show the avatar, ranks, assignments and
   regiments, and SHALL say which sources were searched and which names were tried.
6. IF a Stats Endpoint is slow or failing THEN the system SHALL still show the other sources' tables and SHALL
   name the failing source.
7. WHEN the same player and source are requested again within 60 seconds THEN the system SHALL reuse the
   cached result, and the cache SHALL hold at most 100 entries.
8. IF a configured field value is blank in the sheet THEN the system SHALL show "—" in that table cell.
9. IF the card would exceed Discord's embed limits THEN the system SHALL truncate values (and, if needed, drop
   the least-important tables) instead of failing.
10. WHEN a member holds no roles in one of the three lists (regiments, special assignments, imperial honours)
    THEN the system SHALL show "None" for that section rather than omitting it.
11. WHEN a member runs `/userinfo` THEN the system SHALL require the `configurable` access level.
12. WHEN `/userinfo` replies THEN the reply SHALL be public (not ephemeral) so everyone in the channel can see
    the card (see Requirement 2.5).

### Requirement 11: Coping with outdated usernames in sheets

**User Story:** As an officer, I want the bot to still find a player whose Roblox name changed after an
officer typed it into the sheet.

#### Acceptance Criteria

1. WHEN the system searches for a player THEN it SHALL start from the Roblox user ID obtained from Bloxlink and
   never from a username typed by the officer.
2. WHEN the system searches a sheet THEN it SHALL send the current Roblox username first, then previous
   usernames (most recent first, at most 10), then manual aliases.
3. WHEN names are compared THEN the comparison SHALL ignore letter case and surrounding spaces.
4. IF a match was found using a previous username or an alias THEN the embed footer SHALL say which name
   matched.
5. WHEN an officer runs `/stats-alias add`, `remove` or `list` with a user THEN the system SHALL manage that
   player's aliases, stored against the Roblox user ID, with at most 10 aliases per player.
6. IF the Roblox username history cannot be fetched THEN the system SHALL still search with the current
   username and aliases, and SHALL NOT fail the command.
7. WHEN a member runs `/stats-alias` THEN the system SHALL require the `configurable` access level.

### Requirement 12: Stats Endpoint contract (bot side)

**User Story:** As the maintainer, I want the bot to follow one fixed request/response format, so that the
separately created Google Apps Script and the bot always agree.

#### Acceptance Criteria

1. WHEN the bot queries a Stats Endpoint THEN it SHALL send one JSON `POST` in exactly the format documented
   in `design.md` (secret, tab, headerRow, startColumn, usernameHeader, usernames, headers).
2. WHEN the bot receives a response THEN it SHALL validate the shape with a hand-written type guard, and SHALL
   treat any other shape as a `BAD_RESPONSE` endpoint error.
3. WHEN the endpoint answers with an error code THEN the bot SHALL map `BAD_SECRET`, `TAB_NOT_FOUND`,
   `HEADER_NOT_FOUND`, `BAD_REQUEST` and `INTERNAL` to plain-language messages.
4. WHEN the bot builds a request THEN it SHALL request only the headers that the source's fields need.
5. WHEN tests run THEN the endpoint SHALL be replaced by a fake `fetch` function, so no real sheet or network
   is required.

### Requirement 13: Settings, events and activity storage

**User Story:** As the maintainer, I want data kept in files that are easy to run on my small AWS server and
that survive deployments.

#### Acceptance Criteria

1. WHEN the bot needs to store data THEN it SHALL use three JSON files in a `data/` folder (`settings.json`,
   `events.json`, `activity.json`), with the folder path overridable by an optional `DATA_DIR` environment
   variable, and the folder SHALL be git-ignored.
2. WHEN the bot starts THEN the system SHALL load each file once into memory and serve reads from memory.
3. WHEN data changes THEN the system SHALL write to a temporary file and rename it over the real file, and SHALL
   keep one `.bak` copy of the previous version.
4. IF a file is missing THEN the system SHALL create it with safe defaults.
5. IF `settings.json` or `events.json` exists but cannot be parsed THEN the system SHALL refuse to start, print a
   clear message naming the file, and SHALL NOT overwrite it.
6. WHEN `settings.json` is written THEN the system SHALL restrict file permissions to the owner where the
   operating system supports it, because it contains endpoint secrets.
7. WHEN code needs settings THEN it SHALL use a small interface, so the storage can later be swapped for SQLite
   or a database without changing commands.
8. WHEN the bot is deployed THEN the deployment SHALL NOT delete or overwrite the `data/` folder.

### Requirement 14: Security, memory and operations

**User Story:** As the maintainer of a public repository running on a small server, I want the bot to stay
secure, light and safe to deploy.

#### Acceptance Criteria

1. WHEN code is written THEN it SHALL NOT add plaintext secrets, tokens, or `.env.keys` content to any file,
   log, test, or commit.
2. WHEN the system logs THEN it SHALL NOT include tokens, cookies, Bloxlink keys, Stats Endpoint URLs, or
   Stats Endpoint secrets.
3. IF a new secret is ever required THEN the change SHALL document that it must be added with `dotenvx set`
   and SHALL NOT edit `.env.ci` by hand.
4. WHEN the Discord client is created THEN it SHALL request only the intents in Requirement 7.7 and SHALL set
   the message, reaction and presence caches to zero.
5. WHEN the system keeps a cache or pending-action map THEN it SHALL give it a maximum size and an expiry, and
   SHALL NOT use a timer per cache entry (one debounce timer per active poll is the only permitted timer).
6. WHEN a dependency is added THEN it SHALL be justified in the task summary, and heavy libraries (Google
   client SDKs, ORMs) SHALL NOT be added.
7. WHEN a command is registered THEN it SHALL be server-only and SHALL NOT be usable in DMs.
8. WHEN CI runs THEN it SHALL additionally run a TypeScript type check, and the existing CI/CD flow (CI on
   `release/**`, then SSH deploy to EC2 with pm2) SHALL keep working.
9. WHEN new logic is added THEN it SHALL have vitest unit tests that need no network and no real secrets, by
   passing fake dependencies into the code under test.

### Requirement 15: Readable code for a junior developer

**User Story:** As a junior developer maintaining this bot, I want code I can read top to bottom.

#### Acceptance Criteria

1. WHEN a file is written THEN it SHALL do one job, and its functions SHALL be short (aim for under 40 lines)
   with descriptive names.
2. WHEN code is written THEN it SHALL avoid clever tricks: no deep generics, no nested ternaries, no `any`, no
   `var`.
3. WHEN a function is exported THEN it SHALL have an explicit return type and a one-line comment saying what it
   does.
4. WHEN a comment is written THEN it SHALL explain why, not repeat what the code says.
5. WHEN a command file is written THEN it SHALL start with a short header comment stating name, arguments,
   access level, and what it does.

### Requirement 16: Displayed role lists (regiments, special assignments, imperial honours)

**User Story:** As an officer, I want the bot to know which Discord roles denote regiments, special assignments
(such as Eagle Bearer or Regimental Drummer), and imperial honours, each with an optional emoji, so that
`/userinfo` can show them nicely and I can change the lists from Discord without touching the codebase.

#### Acceptance Criteria

1. WHEN an officer manages a displayed role list THEN the system SHALL provide, for each of the three lists
   (regiments, special assignments, imperial honours), a way to `add`, `remove`, and `list` entries, where each
   entry pairs a Discord role with a display label and an optional emoji.
2. WHEN an officer adds an entry THEN the system SHALL accept an optional emoji (a unicode emoji or a custom
   Discord emoji such as `<:name:id>`) to be shown before the label on `/userinfo`.
3. WHEN a label is omitted while adding THEN the system SHALL use the Discord role's current name as the label.
4. WHEN the lists are stored THEN they SHALL live in the settings store (not the codebase) so changes apply to
   the very next `/userinfo` without a restart.
5. WHEN `/userinfo` builds the card THEN it SHALL show, for the target member, every configured regiment,
   special-assignment, and imperial-honour role that the member holds, each as a bullet-point list item prefixed
   with its emoji when one is set (for example `- 🦅 Porte-Aigle`).
6. IF a member holds more than one role in a list THEN the system SHALL list all of them.
7. WHEN a `list` subcommand runs THEN it SHALL mark any entry whose Discord role no longer exists as
   "deleted role", and the system SHALL ignore deleted roles when building `/userinfo`.
8. WHEN a member runs these role-list commands THEN the system SHALL require the `configurable` access level.
9. WHEN a secret would never be involved THEN these commands SHALL store only role IDs, plain labels, and the
   optional emoji string.

### Requirement 17: Command execution logging to a channel

**User Story:** As an admin, I want every command a member runs to be logged to a Discord channel I choose, so
that I have an audit trail of who did what without reading the server logs.

#### Acceptance Criteria

1. WHEN an admin runs `/log set` with a text channel THEN the system SHALL store that channel and apply it to
   the very next command without a restart.
2. WHEN an admin runs `/log show` THEN the system SHALL show the current log channel (or "not set"). There is
   no `clear` subcommand.
3. WHEN a member runs any command (slash command or context menu) THEN the system SHALL post one log entry to
   the configured log channel containing the command name, the member who ran it, the channel it was run in,
   the time, and a specific summary of what was done.
4. WHEN a command changes something (for example `/rank` or `/accept`) THEN the log entry SHALL include the
   target and the outcome (for example old→new rank, groups touched, Discord role change).
5. WHEN `/eventdm` is confirmed THEN the log entry SHALL be detailed enough to trace a rule-breaking message:
   it SHALL include the role, the recipient count, the results channel (if any), and the exact title and
   message that were sent. (The DM title and message are officer-authored content, not secrets, and SHALL be
   logged in full.)
6. WHEN a log entry would include a true secret (Stats Endpoint URL or secret, Discord/Roblox tokens,
   cookies, Bloxlink key) THEN the system SHALL omit it; all other option values SHALL appear.
7. IF no log channel is configured THEN the system SHALL skip logging silently and SHALL NOT fail the command.
8. IF the configured log channel has been deleted or the bot cannot post to it THEN the system SHALL skip
   logging, log a console warning, and SHALL NOT fail the command.
9. WHEN a member runs `/log` THEN the system SHALL require the `admin` access level, and it SHALL NOT be
   configurable.
10. WHEN the log entry is posted THEN it SHALL NOT create mentions or pings (it may share a channel with other
    logging bots such as Dyno; the bot only posts and never manages the channel).
11. WHEN command logging runs THEN it SHALL NOT block or delay the command's own reply (logging happens
    alongside, and a logging failure never changes the command result).

### Requirement 18: Command localization (English + Chinese Simplified)

**User Story:** As a member of a multilingual guild, I want the bot's slash commands to appear in my Discord
language, so that English and Chinese-speaking players can both read what a command does.

#### Acceptance Criteria

1. WHEN commands are registered THEN the system SHALL provide localizations for command names, option names,
   command and option descriptions, and string-choice names using Discord's native localization
   (`setNameLocalizations` / `setDescriptionLocalizations` and the equivalents), sourced from localization
   files in the repository.
2. WHEN the seed languages are provided THEN the system SHALL include English (the default) and Chinese
   Simplified (`zh-CN`). The framework SHALL make adding another Discord-supported locale a matter of adding a
   file, not changing logic.
3. IF a localization is missing for a locale THEN Discord SHALL fall back to the default (English) value; the
   system SHALL NOT require every string to be translated in every locale.
4. WHEN a language choice is needed THEN it SHALL be settled in the repository's localization files; there
   SHALL be no runtime command to change languages and no per-user or per-guild language storage.
5. WHEN a description is written THEN it SHALL be reasonably in-depth (a clear sentence) but concise, since it
   is now user-facing across languages and within Discord's length limits.
6. WHEN a string cannot be localized through Discord's native mechanism (modal titles and text-input labels,
   button labels, embed and reply content, and sheet/stats data) THEN the system SHALL leave it in English;
   these are out of scope for localization.
7. WHEN a locale is chosen to seed THEN it SHALL be one Discord actually supports; Tagalog is noted as
   unsupported by Discord and is therefore excluded.

### Requirement 19: Themeable fixed embeds

**User Story:** As the maintainer, I want the look of the fixed embed messages (colours, title icons, and the
`/userinfo` card's section emojis) collected in one place, so that I can beautify them without hunting through
the code.

#### Acceptance Criteria

1. WHEN a fixed embed is built (success, warning, error, info, the poll summary, the event-DM embed, the
   Roblox-info embed, and the `/userinfo` card) THEN it SHALL take its accent colour and title icon from a
   single theme configuration file rather than from literals scattered in the code.
2. WHEN the `/userinfo` card is built THEN the emoji shown before each section heading (EF rank, Corps rank,
   regiments, special assignments, imperial honours) SHALL be configurable in the theme file.
3. WHEN the theme file is edited THEN no other code SHALL need to change for the new colours, icons, or section
   emojis to take effect.
4. WHEN the dynamic stats tables are rendered THEN they SHALL remain out of scope for theming; only fixed
   embeds and the fixed sections of the `/userinfo` card are themeable. (Per-role emojis in the regiment,
   special-assignment, and imperial-honour lists come from those lists, not the theme — see Requirement 16.)
5. WHEN the theme file provides a value THEN it SHALL be data only (colours, emoji strings, icon strings), with
   no logic, so it is safe for a junior maintainer to edit.

### Requirement 20: Imperial Honours role list

**User Story:** As an officer, I want a third displayed role list for imperial honours, managed the same way as
special assignments, so that honours a member holds show on their `/userinfo` card.

#### Acceptance Criteria

1. WHEN an officer manages imperial honours THEN the system SHALL provide `add`, `remove`, and `list` for
   imperial-honour entries, each pairing a Discord role with a display label and an optional emoji, exactly as
   for special assignments and regiments (Requirement 16).
2. WHEN `/userinfo` builds the card THEN the imperial-honours section SHALL appear last in the information list
   (after special assignments) and follow the same bullet-point and emoji rules as the other two lists.
3. WHEN a member holds no imperial-honour roles THEN the section SHALL show "None".
4. WHEN a member runs the imperial-honours role-list command THEN the system SHALL require the `configurable`
   access level.
