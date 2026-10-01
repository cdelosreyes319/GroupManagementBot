---
paths:
  - "src/storage/**/*.ts"
  - "src/config/**/*.ts"
---

# Storage and config

## Storage

- All persistence goes through `storage/jsonFile.ts` (atomic write, `.bak`, per-file write queue). Don't write
  files any other way.
- Code reads settings through `SettingsStore.get()` and changes them only through `update(draft => …)`.
- Adding a top-level `Settings` field: update the type, `defaultSettings()`, and `settingsStore.test.ts`
  defaults. `withSettingsDefaults` fills missing **top-level** keys when an older production `settings.json` is
  loaded. New fields **nested** inside existing entries (e.g. a new key on `StatsSource` or `RoleLabel`) are not
  filled — readers must tolerate them being absent.
- A corrupt `settings.json` / `events.json` must make startup fail without overwriting the file.
- `settings.json` holds endpoint secrets: keep mode `0o600`, never log or display its contents.
- `data/` is runtime-only and git-ignored. Never commit it, never delete it, never write fixtures into it (tests
  use a temp dir).

## Config

- `config/rankSync.ts`, `config/rankRoles.ts`, `config/theme.ts` are **data only**: no functions, no imports of
  services. Logic over them lives in `services/rankSyncService.ts`, `services/rankRoleService.ts`,
  `ui/embeds.ts`.
- `config/constants.ts` must not read `process.env` so tests can import it freely. Environment access lives
  only in `init.ts`.
- Changing rank numbers, Corps role names or Discord role IDs requires the owner's confirmation — these mirror
  the real Roblox groups and Discord server.
