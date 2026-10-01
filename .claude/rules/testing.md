---
paths:
  - "src/**/*.test.ts"
---

# Tests

- vitest. Test files sit beside the module: `foo.ts` → `foo.test.ts`.
- No network, no real Discord/Roblox/Bloxlink/Sheets, no secrets. Pass fakes through `create*(deps)` or function
  parameters. A fake `fetch` returns `new Response(JSON.stringify(...))`.
- Never import `src/init.ts` (it needs the decrypted env). Import `config/constants.ts` instead.
- Time: inject `now`, or use `vi.useFakeTimers()` and restore in `afterEach`. Filesystem: a fresh
  `fs.mkdtemp(os.tmpdir())` per test, removed afterwards.
- Name tests by behaviour (`"skips excluded members before applying the limit"`), and cover the edge cases the
  requirement lists — boundaries (0, 255, limit 1, max), deleted roles, failures that must not undo earlier
  steps, Discord length limits.
- Run one file: `npx vitest run src/path/file.test.ts`. Full unit suite: `npx vitest run --exclude src/main.test.ts`.
