---
name: add-command
description: Checklist-driven scaffold for adding a new Discord slash command or user context-menu command to GroupManagementBot, covering registry, access level, permissions, localization, logging, reply visibility, README, and deploy-commands. Use when a task or the user asks to add a new command.
argument-hint: <command-name>
---

# Add a command

Input: `$ARGUMENTS` = command name (kebab-case, as users will type it).

A command should normally come from an approved feature spec task. If there is none, confirm with the owner the
command's purpose, options, access level and reply visibility first.

## Files to touch

1. **`src/commands/<name-without-dashes>.ts`** — copy the shape of an existing command of similar complexity
   (`ping.ts` minimal, `log.ts` with `configure()` + subcommands, `statsalias.ts` with autocomplete).
   - Header comment: `// /<name>`, `// Arguments: …`, `// Access: …`, `// What it does: …`.
   - `export const access: AccessLevel = "public" | "configurable" | "admin"`.
   - `data`: `.setDMPermission(false)`; admin → `.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)`;
     group choices only via `MANAGED_GROUPS`; wrap with `applyLocalizations(builder, "<name>")`.
   - `execute`: read options → call a service → build an embed from `ui/embeds.ts`. `deferReply` first if any
     API call is involved. Visibility: information = public, change/config = ephemeral, refusals/errors =
     ephemeral.
   - Needs a store/service? Export `configure(...)` and wire it in `main.ts` `bootstrap()`.
   - Autocomplete: ≤25 choices, and return `[]` quickly on errors.
2. **Service / pure logic** in `src/services/` with a `*.test.ts` beside it. Commands hold no business rules.
3. **`src/commands/index.ts`** — add to `commands` (slash) or `userContextMenus` (context menu).
4. **`src/i18n/localizations.ts`** — zh-CN entries: `"_"` for the command description plus one per option and
   subcommand. Keep them as concise as the English.
5. **Buttons/modals?** Use `buildCustomId("<feature>", "<action>", id)`; register a `ComponentHandler` in
   `main.ts` `componentHandlers[<feature>]` with `commandName: "<name>"` so permissions apply.
6. **Logging (R17):** the router logs the base entry automatically. If the command changes something, make sure
   its outcome reaches the log detail (follow how `/rank` and `/accept` do it). Secret-bearing option names
   must be in the router's `SECRET_OPTION_NAMES`.
7. **`README.md`** — add a row to the command table and a behaviour section if needed.
8. **Specs** — the feature spec covers requirements; `/spec-close` will add the command to `design.md`'s
   folder layout and command table.

## Verify

- `npm run typecheck` and `npx vitest run --exclude src/main.test.ts`.
- Tell the owner: **run `npm run deploy-commands`** after release, then `/permissions add` for the command if
  it is `configurable` (it is admin-only until roles are added — fail closed).
