# <Feature name> — Tasks

- **Slug:** `<slug>`
- **Status:** draft | approved | in progress | done

Rules: do tasks in order; leave `npm run typecheck` and the unit tests green after each one; don't implement
anything that isn't listed here (add a task first if scope must grow).

- [ ] 1. <Outcome, e.g. "Pure rate-limit helper with tests">
  - Files: `src/services/<x>.ts`, `src/services/<x>.test.ts`
  - Do: <what must be true when finished, including edge cases>
  - Done when: `npx vitest run src/services/<x>.test.ts` passes and covers <cases>
  - _Requirements: R<n>.1, R<n>.2_

- [ ] 2. <Outcome, e.g. "Wire into /<command>">
  - Files: …
  - Do: …
  - Done when: …
  - _Requirements: …_

- [ ] 3. Docs
  - Update `README.md` (command table, behaviour section) and `src/i18n/localizations.ts` (zh-CN) if needed.
  - _Requirements: R15_

- [ ] 4. Checkpoint
  - `/checkpoint <slug>`: typecheck, unit tests, build, spec audit.
  - Note for the owner whether `npm run deploy-commands` is required.
