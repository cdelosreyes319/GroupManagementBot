# Backlog

Known drift between spec and code, open questions, tech debt, and ideas. Found during the Kiro → Claude Code
migration audit on 2026-10-02 unless noted. Feature specs that resolve an item reference it (`Resolves B-3`);
`/spec-close` moves resolved items to the bottom section.

Priority: **P1** = user-visible bug or risk · **P2** = spec/code mismatch needing a decision · **P3** = debt/idea.

## Open

### B-1 · P2 · `/eventdm` limit text still says "default 250"

**Decision (owner, 2026-10-02): the default is 1000** — matching `LIMITS.eventDmMaxRecipients` and the
current code in `commands/eventdm.ts`, which defaults an omitted `limit` to that value. No behaviour change.

Remaining text drift to fix:
- `limit` option description in `commands/eventdm.ts`: "Maximum recipients (1–1000, default 250)." → default 1000.
- File header comment in `commands/eventdm.ts`: "1–250, optional, default 250" → 1–1000, default 1000.
- zh-CN `eventdm.limit` text: "最大接收人数（1–250，默认 250）" → 1–1000，默认 1000.

Do this as part of the localisation rework (B-9), since it touches the same strings and both need
`npm run deploy-commands`. Then remove the "as built" note on R4.1.

### B-2 · P3 · Choice-name localization

Original R18.1 asked for localized string-choice names. Only descriptions are localized. Candidates:
`/rank group` (proper nouns — probably leave), `/stats-source field-add format` (text/number/percent).
Decide whether it is worth it; otherwise retire the idea.

### B-3 · P3 · Files over the ~200-line guideline (R15.1)

| File | Lines | Note |
|------|-------|------|
| ~~`src/interactions/eventDmInteractions.ts`~~ | ~~440~~ → 188 | split 2026-10-17 into `eventDmInteractions` / `eventDmMembers` / `eventDmSend` / `eventDmPoll` / `eventDmContext`, each under 200 |
| `src/services/eventDmService.ts` | ~230 | grew with `claimSend`/`cancel`/`releaseClaim` (B-15); the per-officer rate limiter (`recordSendAndCheck`) is a clean seam to split out |
| `src/commands/statssource.ts` | ~400 | Kiro task 13.5 said to split `field-*` into `statssourceFields.ts` past ~200 lines; not done |
| `src/interactions/router.ts` | ~275 | |
| `src/commands/rankuser.ts` | ~230 | also contains Discord role application (see B-4) |

Split along existing seams; behaviour unchanged; no new tests needed beyond keeping the suite green.

### B-4 · P3 · Discord rank-role application lives in the command

`commands/rankuser.ts` calls `member.roles.add/remove` and builds the outcome text itself. The diff is pure
and tested (`computeRankRoleChange`), but the apply-and-report path (including the failure reasons for R3.20)
is untested. Option: a small `applyRankRoleChange(member-port, change)` service with a fake member in tests.

### B-5 · P3 · `main.test.ts` is a placeholder that needs secrets

It only checks `getCorpsID() === groups.DISCORD_CORPS_ID` (and has a stray `// sup2` comment), yet it forces
`npm run tests` to run under dotenvx with `DOTENV_PRIVATE_KEY_CI`. Options: delete it, or rewrite it against
`config/constants.ts` so the whole suite runs without secrets (then `tests` could drop dotenvx locally).

### B-6 · P3 · Percent formatting edge case

`formatValue(…, "percent")` treats any value in (0, 1] as a fraction, so a sheet cell holding `1` meaning 1%
renders as `100%`. Document for sheet owners or add a per-field "already a percentage" flag.

### B-7 · P3 · `.vscode/launch.json` drift

"Deploy Commands" runs `tsx watch` and `dotenvx run` without `-f .env.ci`, unlike `package.json`
(`tsx`, `-f .env.ci`). Align or remove.

### B-9 · P2 · Rework localisation to per-locale JSON files (planned)

The owner expected localisation to be data in JSON files (e.g. `src/i18n/locales/zh-CN.json`), not
TypeScript tables. Today all zh-CN strings live in `src/i18n/localizations.ts`. A feature spec
(`/spec-new B-9`) will cover:

- File layout and key scheme for per-locale JSON (command → option/subcommand → description; English stays on
  the builders or moves to `en-US.json` — decide in the spec).
- Loading: `resolveJsonModule` is already on; validate the JSON shape with a type guard and fail
  `deploy-commands` loudly on a malformed file, keeping Discord's English fallback for missing keys.
- Adding a locale = adding a file (R18.2), no code change.
- Fold in B-1 (limit text) and decide B-2 (choice names).
- Tests for the loader and `applyLocalizations`; `npm run deploy-commands` after release.

### B-14 · P2 · Change how poll results are shown (needs owner decisions)

The owner wants to change the results embed layout. Changes R5.5, so it goes through `/spec-new`. Open
questions:
- Show voters as `<@id>` mentions (render the current nickname, clickable, never ping inside an embed, and
  also fix polls stored with IDs before B-11) or as stored plain names?
- One voter per line, or comma-separated?
- Should "No answer" list names, or stay a count?
- Anything else (answer time, sort order)?

Keep the per-answer cap and "+N more" within the 1024-character field limit.

### B-8 · P3 · Legacy naming `DISCORD_CORPS_ID`

`init.ts` still exposes the Discord server ID as `groups.DISCORD_CORPS_ID` (kept for `main.test.ts`).
`config/constants.ts` has `DISCORD_SERVER_ID`. If B-5 removes the test, consolidate on `DISCORD_SERVER_ID`.

## Resolved

### B-15 · ~~P1~~ · Double-clicking Confirm sent every DM twice

_Found 2026-10-17 by a fake-Discord repro of `confirmSend`; also present on `main`._ The lock was checked, then
the handler awaited `interaction.update` before removing the draft and taking the lock, so a second click passed
the same check. **Resolved 2026-10-17** (`fix/eventdm/broadcast-reliability`): `eventDmService.claimSend` checks
the draft status, lock and cooldown and takes the lock synchronously before the first `await`; drafts keep a
`status` so the second press is told "already confirmed". Lock released by `finishSend` in a `finally`, or by
`releaseClaim` (no cooldown) if the "Sending…" update fails before anything is sent.

### B-16 · ~~P1~~ · Two officers confirming at the same moment both broadcast (R4.12)

Same gap as B-15 with two different drafts. **Resolved 2026-10-17** by the same synchronous `claimSend`.

### B-17 · ~~P1~~ · Poll answers given during a broadcast were erased when it finished

`recordAnswer` saved a new copy of the record; the send loop then saved its copy from before sending (no
answers) over it. **Resolved 2026-10-17**: `eventStore.update(id, change)` edits the latest saved record inside
the write queue; `recordAnswer` and the send loop use it. New R5.12; regression tests in `eventStore.test.ts`
and `pollService.test.ts`.

### B-18 · ~~P1~~ · The bot's own member could be evicted from the member cache

`GuildMemberManager: 200` had no `keepOverLimit`, so a full member fetch evicted the bot; `guild.members.me`
then returned `null` and `/rank` reported "the bot lacks the Manage Roles permission". **Resolved 2026-10-17**:
`keepOverLimit` keeps the bot's member; `/rank` also falls back to `members.fetchMe()`.

### B-19 · ~~P2~~ · Results-channel check ignored Embed Links (R4.2)

**Resolved 2026-10-17**: `/eventdm` requires View Channel, Send Messages and Embed Links in the results channel.

### B-20 · ~~P2~~ · Open polls could be pruned before closing

The store kept the newest 20 regardless of state; a pruned poll's buttons said "not open to you".
**Resolved 2026-10-17**: closed polls are pruned first (R5.10); a press on a poll no longer stored is treated
as closed (R5.6).

### B-21 · ~~P3~~ · Expired preview buttons stayed clickable (R4.8)

**Resolved 2026-10-17** within the no-per-entry-timer rule: the first press after expiry replaces the preview
with an "expired" notice and removes its buttons (R4.8 as-built note).

### B-22 · ~~P3~~ · A restart mid-send counted never-messaged members as "No answer"

The poll stored every planned recipient up front. **Resolved 2026-10-17**: each recipient is added just before
their DM and removed the moment their DM fails (R5.13). Costs one `events.json` write per DM (plus one per
failure).

### B-10 · ~~P1~~ · `/eventdm` modal submit shows the generic error when Discord rate-limits the member fetch

_Found 2026-10-17 from an officer report (ephemeral "Something went wrong" under "used /eventdm")._

`handleModal` calls `guild.members.fetch()` with no arguments (gateway opcode 8, all members). Discord
rate-limits that request per server; discord.js 14.25 rejects with `GatewayRateLimitError` ("Request with
opcode 8 was rate limited. Retry after N seconds."). Nothing catches it, so the router replies with
`MESSAGES.genericError`. Any officer submitting within the window of another submission (or cancelling and
resubmitting quickly) hits it. The same line can also reject with `GuildMembersTimeout` after 120 s.
Confirm in pm2 logs: `Unhandled interaction error: GatewayRateLimitError: …`.

Fix: catch both errors and tell the officer to wait N seconds and run `/eventdm` again. (Discord's docs confirm
the rate limit and its `retry_after`, but not a fixed window length; the code always uses `retry_after`.)

**Resolved 2026-10-17** (branch `fix/eventdm/broadcast-reliability`): `utils/memberFetchError.ts` classifies the rate-limit and timeout errors (tested); `fetchRoleMembers` in `eventDmInteractions.ts` replies with `MESSAGES.memberListRateLimited(N)` / `memberListTimeout`. New R4.18.

### B-11 · ~~P1~~ · Poll results and failure lists show user IDs instead of names

`handleModal` read display names from `guild.members.cache`, which is capped at 200 members
(`GuildMemberManager` in `main.ts`). After the full fetch most recipients are no longer cached, so the name
fell back to the raw ID. The IDs are stored in `events.json` `displayNames` and shown in the results embed
(R5.5) and the "Failed recipients" summary (R4.11).

Fix: read names from the fetched member collection. Polls already stored keep their IDs (see B-14).

**Resolved 2026-10-17** (same branch): names are read from the fetched role members.

### B-12 · ~~P1~~ · Broadcasts longer than 15 minutes skip the log entry and the rate limit

Interaction tokens expire after 15 minutes. With a 1.2 s gap, any broadcast over ~750 recipients (cap 1000)
outlives the token. The final `editReply` then throws, the error reply also fails silently, and the code
after it never runs: no `/eventdm (sent)` log entry (R17.5), and no rate-limit count or blacklist
(R4.15–4.16). That makes large sends a way around the misuse controls.

Fix: count the send toward the rate limit at Confirm (as `design.md` already shows), log before replying, and
deliver the final summary by DM to the officer when the interaction can no longer be edited.

**Resolved 2026-10-17** (same branch): `eventDmSend.ts` counts the send right after Confirm, logs before replying, warns at Confirm when `sendOutlivesReply` (tested), and DMs the summary when `editReply` fails. New R4.19.

### B-13 · ~~P2~~ · Event DM footer uses the officer's username, not their display name

R4.13 says the DM shows "the sending officer's display name"; the preview and the sent DM used
`interaction.user.username`. Fix: capture the officer's server display name at modal submit and use it for
both the preview and the DMs.

**Resolved 2026-10-17** (same branch): `PendingBroadcast.requesterName` holds the server display name, used by the preview and the DMs.

### B-0 · ~~P1~~ · `/eventdm` crashes on a `settings.json` written before task 26

`settings.json` is loaded as-is (`storage/jsonFile.ts` does not merge `defaultSettings()`). Task 26 added
`eventDmBlacklist`, but `interactions/eventDmInteractions.ts:124` and `:351` call
`settings.eventDmBlacklist.includes(...)` with no `?? []` fallback. On a server whose `settings.json` predates
that commit, every `/eventdm` hits the router's generic error. (`regiments`, `specialAssignments`,
`imperialHonours`, `logChannelId` readers already tolerate absence.)

Suggested fix: fill missing top-level keys from `defaultSettings()` on load in `createJsonSettingsStore`
(one place, covers future fields), plus a regression test that loads a v1 file missing the newer keys. Then
simplify the scattered `?? []` guards.

**Resolved 2026-10-02** (branch `fix/settings/missing-keys`): `withSettingsDefaults` in `storage/types.ts`
fills missing top-level keys from `defaultSettings()` on load (via a new `normalise` option on `jsonFile`).
The file is not rewritten on load; the next `update` saves the full shape. Regression tests in
`settingsStore.test.ts`. The scattered `?? []` guards were left in place (harmless).
