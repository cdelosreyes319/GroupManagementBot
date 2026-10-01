# GroupManagementBot

Discord bot (TypeScript, discord.js v14, noblox.js) that lets officers of a Napoleonic-Wars-style Roblox guild
manage two Roblox groups — **Empire Français** (`5610765`) and **Neuvième Corps** (`13206132`) — from one Discord
server. Deployed by GitHub Actions to AWS EC2 under pm2. Secrets live in a dotenvx-encrypted `.env.ci`.

The maintainer is a junior-friendly codebase owner: code must be readable top to bottom.

## Where things are

- **Specs (source of truth for behaviour):** `.claude/specs/` — start at `.claude/specs/README.md`.
  - `requirements.md` — living, numbered requirements (R1–R20). Cite them as `R3.17`.
  - `design.md` — living, as-built architecture and data models.
  - `backlog.md` — known drift, open questions, tech debt.
  - `features/<slug>/` — one folder per in-flight change (requirements → design → tasks).
- **Legacy:** `.kiro/` holds the original Kiro specs (v1, tasks 1–27, all done). Read-only history; do not edit.
- **User docs:** `README.md` (commands, setup, operations). Keep it in sync with behaviour changes.

## Commands

```bash
npm install --ignore-scripts   # noblox.js postinstall banner crashes without this
npm run typecheck              # tsc --noEmit
npx vitest run --exclude src/main.test.ts   # all unit tests, no secrets needed
npm run tests                  # full suite via dotenvx (needs DOTENV_PRIVATE_KEY_CI; CI has it)
npm run build                  # tsup -> dist/main.js
```

- Prefer the `npx vitest run ...` form locally; only `src/main.test.ts` needs the decrypted env.
- Run a single file with `npx vitest run src/services/rankService.test.ts`.
- `npm run dev` and `npm run deploy-commands` talk to real Discord/Roblox. **Never run them** — the owner does.
  Instead, tell the owner when `deploy-commands` is required (any change to a command's `data` builder or i18n).

## Architecture in one screen

```
commands/ , interactions/   →   services/   →   api/ , storage/
                 ui/ , utils/ , config/ , i18n/  (importable by anyone)
```

- Never import upwards. Services never touch Discord interaction objects.
- `main.ts` is the single composition root: stores and services are wired once in `bootstrap()` via
  `configureX(...)` and reached with `getX()` (`services/*Instance.ts`, command `configure()` exports).
- `interactions/router.ts` is the only `interactionCreate` handler: server-only check, permission check,
  dispatch, central try/catch, command logging. Component handlers are keyed by custom-ID prefix
  (`feature:action:id[:extra]`, built/parsed only by `interactions/customId.ts`).
- Persistent state: `data/settings.json`, `data/events.json`, `data/activity.json` via `storage/jsonFile.ts`
  (atomic write + `.bak`). `data/` is git-ignored and must survive deploys.
- Data-only config files (no logic): `config/rankSync.ts`, `config/rankRoles.ts`, `config/theme.ts`,
  `config/constants.ts` (`MANAGED_GROUPS`, `LIMITS`).

Full detail: `.claude/specs/design.md`.

## Non-negotiables

1. **Secrets.** Never read, print, decrypt or commit `.env.keys`. Never edit `.env.ci` by hand (new secrets go
   through `dotenvx set`, done by the owner). Never log tokens, cookies, the Bloxlink key, Stats Endpoint URLs or
   secrets.
2. **Only the two managed groups.** No code path accepts a Roblox group ID from user input; use `GroupKey`.
3. **Mentions.** Every bot message uses `allowedMentions: { parse: [] }` except the single `@everyone` alert in
   `commandLogger.alert` (R4.16).
4. **Bounded memory.** Every cache/map has a max size and expiry; no per-entry timers; the only timer is the
   per-poll debounce. Intents stay `Guilds`, `GuildMembers`, `GuildMessages`, `GuildVoiceStates`.
5. **No heavy deps.** No Google SDKs, ORMs, or framework additions. Any new dependency must be justified.
6. **Do not touch** `.github/workflows/cd.yml` deploy logic unless a spec task explicitly says so.
7. **Tests use fakes.** No network, no real Discord/Roblox, no secrets. Inject dependencies.

## Code style (enforced in review)

- One command per file in `src/commands/`, starting with the header comment (name, arguments, access, what it
  does). One job per file elsewhere; split past ~200 lines.
- Commands read options, call services, build the reply. No business rules or API calls in commands.
- Explicit return types and a one-line "what it does" comment on every export. Comments explain *why*.
- No `any`, no `var`, no nested ternaries, no deep generics. Early returns. Plain loops over clever `reduce`.
- `unknown` + hand-written type guard for any external data.
- User-facing text: `ui/messages.ts`; embeds: `ui/embeds.ts` using `config/theme.ts`.
- Tests sit beside the code as `*.test.ts`. Pure modules import `config/constants.ts`, never `init.ts`.

## Workflow

Non-trivial changes go through a spec. Use the project skills:

| Skill | When |
|-------|------|
| `/spec-new <idea>` | Start a feature or change: writes `features/<slug>/requirements.md`, `design.md`, `tasks.md`, pausing for owner approval between phases. |
| `/spec-implement <slug> [task]` | Implement the next unchecked task(s) of a feature spec, test-first, with verification. |
| `/checkpoint [slug]` | Typecheck, tests, build, spec audit, README and deploy-commands reminders. |
| `/spec-close <slug>` | Fold a finished feature into the living `requirements.md` / `design.md` and archive it. |
| `/add-command <name>` | Checklist-driven scaffold for a new slash command. |

The `spec-auditor` subagent does a read-only requirements-vs-code check; `/checkpoint` uses it.

Small fixes (typo, one-line bug, doc tweak) skip the spec but still: run typecheck + affected tests, and update
`backlog.md` if they resolve an entry.

## Git

**Pushing to any `release/**` branch auto-deploys to production** (CI → CD on success). Never push, merge,
rebase or reset a `release/**` branch without the owner's explicit go-ahead for that specific push.

Branch names follow `<genre>/<specifics>[/…]`:

| Genre | Use | Examples |
|-------|-----|----------|
| `release/` | Production lines. **Deploys on push.** | `release/v1` (current Kiro build), `release/v0.1` (pre-agent) |
| `feature/` | New behaviour from a spec | `feature/i18n/json-locales`, `feature/robloxranking` (pre-agent) |
| `fix/` | Bug fixes | `fix/settings/missing-keys` |
| `chore/` | Tooling, docs, workflow, refactors with no behaviour change | `chore/claude/workflow` |
| `dev/` | Owner's integration lines | `dev/v1.1` |
| `archive/` | Frozen snapshots, never deleted or moved | `archive/kiro/v1` (= `release/v1` at `1739dd9`) |

- Keep `release/v0.1`, `feature/robloxranking` and the `archive/` branches as history. Never delete them.
- Work on a `feature/`, `fix/` or `chore/` branch off `main`. Never commit directly to `main` or `release/**`.
- Commit only when asked. Pushing non-release branches and opening PRs is fine once the owner has asked for
  them. PRs run CI only and never deploy.
