---
paths:
  - "src/services/**/*.ts"
  - "src/api/**/*.ts"
  - "src/utils/**/*.ts"
---

# Services, API wrappers, utils

- Services never import from `commands/` or `interactions/`, and never take Discord interaction objects. Pass
  plain data or narrow "port" types (e.g. `{ id, roleIds }`) instead of `GuildMember` where practical.
- Prefer pure functions. Stateful services use a `create<X>(deps)` factory; the configured singleton lives in a
  sibling `<x>Instance.ts` with `configure<X>()` / `get<X>()`, wired once in `main.ts`.
- Inject clocks (`now: () => number`), `sleep`, timers, and `fetch` so tests control them.
- `api/` wrappers are thin: one external call each, `AbortSignal.timeout(LIMITS.httpTimeoutMs)`, typed failure
  results instead of throwing where callers need to branch. Parse responses from `unknown` with a hand-written
  type guard.
- Never log URLs with secrets, headers, tokens, cookies, the Bloxlink key, Stats Endpoint URLs or secrets. Log
  `error instanceof Error ? error.message : "unknown"`, not raw error objects from HTTP clients.
- Caches/maps: use `TTLCache` or an equivalent with a max size and lazy expiry. No `setInterval`; no per-entry
  timers. The per-poll debounce in `pollService` is the only timer.
- Tunables go in `LIMITS` (`config/constants.ts`), not as literals.
- Services never import noblox.js directly — go through `api/roblox.ts`.
