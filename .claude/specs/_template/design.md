# <Feature name> — Design (delta)

- **Slug:** `<slug>`
- **Status:** draft | approved
- **Requirements:** R<n>, R<x>.<y>

Only describe what changes relative to `../../design.md`. Reference unchanged sections instead of copying them.

## Approach

<The chosen approach in a paragraph. If there was a real alternative, one line on why it lost.>

## Module changes

| File | New / changed | Layer | Responsibility |
|------|---------------|-------|----------------|
| `src/services/<x>.ts` | new | service | … |
| `src/commands/<y>.ts` | new | command | … |

Check: no upward imports; commands contain no business rules; new shared logic is in `services/`, `api/`, `ui/`
or `utils/`.

## Contracts

```ts
// Exported types / function signatures, with one-line comments.
```

## Flow

<Mermaid diagram or numbered steps for the main path and each refusal/failure path.>

## Data model changes

- `Settings` / `EventRecord` / `ActivityFile` changes: …
- Default value in `defaultSettings()`: …
- Existing `settings.json` files on the server: <how old files without the new field are handled>.

## Discord surface

- Command / option definitions changed? → `npm run deploy-commands` needed after release.
- New i18n description keys (zh-CN) in `src/i18n/localizations.ts`: …
- Reply visibility and access level: …
- Custom-ID prefix (if buttons/modals): `<feature>:<action>:<id>`; router handler registration.
- Command log detail line (R17): …

## Security & resource checks

- Secrets touched? Logged? (must be no)
- New cache/map: max size … TTL …
- New dependency: none | <name> — justification …

## Test plan

- Pure unit tests: …
- Service tests with fakes: …
- Not tested automatically (needs live Discord/Roblox): … → manual check for the owner.
