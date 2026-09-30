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

- The bot serves one Discord server (the ID already in `init.ts`).
- The bot's Roblox account already holds a rank high enough in both groups to rank people.
- The rank numbers and Corps rank names in the Rank Sync Table are placeholders the owner will confirm; the
  code must make them easy to edit in one file.
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
5. WHEN a command result is only relevant to the officer THEN the system SHALL reply ephemerally.
6. WHEN the system replies to a command THEN it SHALL use Discord embeds with one consistent look (colour,
   footer, success/warning/failure icons) built by a shared helper.
7. WHEN `/accept` or `/rank` changes something in Roblox THEN the reply SHALL show what changed (for example
   "Sergent → Adjudant in Empire Français") and which officer did it.
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

### Requirement 10: Player stats card

**User Story:** As an officer or member, I want one command that shows a player's stats in a professional
card, so that I can check promotion progress without opening the spreadsheets.

#### Acceptance Criteria

1. WHEN a member runs `/userinfo` with a `user` and an optional `source` (autocomplete of source names) THEN
   the system SHALL look the player up in the chosen source.
2. IF `source` is omitted THEN the system SHALL query every enabled Stats Source, at most 3 at a time, and show
   one embed for each source that contains the player, up to 3 embeds.
3. WHEN the stats embed is built THEN it SHALL show the Roblox username, avatar headshot, rank in each Managed
   Group, the configured fields in the configured order, the source name in the footer, and the source's
   accent colour.
4. IF the player is found in no source THEN the system SHALL say which sources were searched and which names
   were tried, and SHALL still show the group ranks.
5. IF a Stats Endpoint is slow or failing THEN the system SHALL still show results from the other sources and
   SHALL name the failing source.
6. WHEN the same player and source are requested again within 60 seconds THEN the system SHALL reuse the
   cached result, and the cache SHALL hold at most 100 entries.
7. IF a configured field is blank in the sheet THEN the system SHALL show "—".
8. IF the card would exceed Discord's embed limits THEN the system SHALL truncate values instead of failing.
9. WHEN a member runs `/userinfo` THEN the system SHALL require the `configurable` access level.

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
