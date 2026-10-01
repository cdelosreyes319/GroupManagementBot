---
paths:
  - "src/commands/**/*.ts"
  - "src/interactions/**/*.ts"
---

# Commands and interactions

- One command per file. First lines are the header comment: `// /<name>`, `// Arguments:`, `// Access:`,
  `// What it does:`.
- Exports: `data`, `access`, `execute`, optional `autocomplete`, optional `configure(...)` (wired in `main.ts`).
- Commands read options, call a service, build the reply. Business rules, Roblox/Bloxlink/HTTP calls and data
  shaping belong in `services/` (testable with fakes). Keep this layer thin — it has no unit tests.
- Every builder: `.setDMPermission(false)`, wrapped in `applyLocalizations(builder, "<name>")`. Admin commands
  also set `.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)`; the router stays the real gate.
- Groups come only from `MANAGED_GROUPS` choices (value = `GroupKey`). Never accept a group ID.
- Reply visibility: info commands public; change/config commands ephemeral; previews, confirmations, refusals,
  errors always ephemeral (`MessageFlags.Ephemeral`).
- `deferReply` before any external call (3-second interaction deadline); then `editReply`.
- Embeds from `ui/embeds.ts`; strings from `ui/messages.ts`; colours/icons from `config/theme.ts`.
- Any message the bot sends: `allowedMentions: { parse: [] }`.
- Custom IDs only via `buildCustomId` / `parseCustomId` (`feature:action:id[:extra]`, ≤100 chars). New features
  register a `ComponentHandler` with the owning `commandName`.
- Changing any `data` builder means the owner must run `npm run deploy-commands` — say so in your report, and
  add/adjust zh-CN descriptions in `src/i18n/localizations.ts`.
- Respect Discord limits: 25 choices/fields, 256/1024/4096/6000 chars, 5 buttons per row.
