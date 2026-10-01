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
| `src/interactions/eventDmInteractions.ts` | ~440 | modal, preview, confirm/send, RSVP, alert in one file |
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

### B-8 · P3 · Legacy naming `DISCORD_CORPS_ID`

`init.ts` still exposes the Discord server ID as `groups.DISCORD_CORPS_ID` (kept for `main.test.ts`).
`config/constants.ts` has `DISCORD_SERVER_ID`. If B-5 removes the test, consolidate on `DISCORD_SERVER_ID`.

## Resolved

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
