# Delivery history

One line per closed feature spec, newest first. Detail lives in git history and in `.kiro/` for v1.

## Claude Code era

| Date | Feature slug | Requirements | Summary |
|------|--------------|--------------|---------|
| 2026-10-02 | _fix/settings/missing-keys_ | R13.4 | Fill top-level keys missing from an older `settings.json` with defaults on load (B-0). |
| 2026-10-02 | _migration_ | — | Moved specs from `.kiro/` to `.claude/specs/` as living docs; audited drift into `backlog.md`. |

## Kiro era (v1) — `.kiro/tasks.md`, tasks 1–27, all complete

| Tasks | Delivered | Requirements |
|-------|-----------|--------------|
| 1–5 | Foundations: constants, utils, UI helpers, minimal intents; api layer; JSON storage; command registry, router, permissions, `/permissions` | R1, R8, R13, R14 |
| 6 | `/accept` rewrite, `/whois`, "Roblox Info" context menu | R2 |
| 7–8 | `/rank` with Empire Français → Neuvième Corps sync; startup sync-table check | R3.1–3.16 |
| 9 | Activity tracking | R7 |
| 10–12 | `/eventdm` preview/confirm/send, exclusions, attendance poll | R4.1–4.14, R5, R6 |
| 13–14 | Stats sources, fields, aliases, `/userinfo`; README; security sweep | R9–R12 |
| 15 | Discord rank-role sync in `/rank` | R3.17–3.21 |
| 16–18 | Regiment / special-assignment role lists (`/roles`); grid-style `/userinfo` card | R10, R16 |
| 19 | Public replies for information commands | R2.5–2.5b |
| 20–21 | `/log` and command logging to a channel | R17 |
| 22 | Per-role emoji, Imperial Honours, reordered `/userinfo` sections | R16, R20 |
| 23 | Themeable fixed embeds (`config/theme.ts`) | R19 |
| 24–25 | zh-CN command localization | R18 |
| 26–27 | Misfeasor mitigations: self-rank block, admin-only hardening, `/eventdm` rate limit + blacklist + `@everyone` alert | R3.22, R4.15–4.17, R8.6a |
