---
name: checkpoint
description: Verify GroupManagementBot is releasable - typecheck, unit tests, build, spec-vs-code audit, README and deploy-commands checks. Use at the end of a feature spec, before opening a PR, or when the user asks "is this ready" or for a checkpoint.
argument-hint: "[slug]"
---

# Checkpoint

Input: optional `$ARGUMENTS` = feature slug. Without one, check the whole working tree against the living specs.

Run these and collect results; don't stop at the first failure unless the build is broken.

1. **Typecheck:** `npm run typecheck`.
2. **Unit tests:** `npx vitest run --exclude src/main.test.ts`. (`npm run tests` needs the dotenvx key; CI runs
   it. Mention this rather than trying to decrypt anything.)
3. **Build:** `npm run build`, then check `dist/main.js` exists and is >1000 bytes (same as CD). `dist/` is
   git-ignored; leave it.
4. **Spec audit:** launch the `spec-auditor` subagent with the feature slug (or "baseline") to check the
   requirements against the code. Include its findings.
5. **Changed surface** (`git diff --stat main...HEAD` plus uncommitted changes):
   - Any `src/commands/*.ts` `data` builder or `src/i18n/*` changed → **`npm run deploy-commands` required**
     after release (owner runs it).
   - User-facing behaviour changed → `README.md` updated? (command table, behaviour sections).
   - `Settings` shape changed → defaults, store tests, old-file tolerance for nested fields (top-level keys are filled on load).
   - `package.json` dependencies changed → justified?
   - `.github/workflows/cd.yml`, `.env.ci`, `.env.keys` touched → flag loudly.
6. **Secrets sweep on the diff:** grep the diff for `console.` lines that could print URLs, secrets, tokens or
   cookies, and for `allowedMentions` missing on new sends.

## Report format

```
Checkpoint: <slug or baseline>
  typecheck   ✅/❌
  unit tests  ✅ N passed / ❌ (failures)
  build       ✅ size / ❌
  spec audit  ✅ / ⚠ findings (list)
  README      ✅ / ⚠
  deploy-commands needed: yes/no (why)
  other flags: …
```

If everything passes for a feature slug, tick its checkpoint task and suggest `/spec-close <slug>`.
