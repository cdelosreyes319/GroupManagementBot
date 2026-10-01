---
name: spec-implement
description: Implement the next unchecked task(s) from an approved GroupManagementBot feature spec in .claude/specs/features/<slug>/tasks.md, test-first, keeping typecheck and tests green. Use when the user says to build, implement, or continue a spec'd feature.
argument-hint: <slug> [task number | "all"]
---

# Implement spec tasks

Input: `$ARGUMENTS` → `<slug>` and optionally a task number or `all`. Default: the next unchecked task.

## Before coding

1. Read `.claude/specs/features/<slug>/requirements.md`, `design.md`, `tasks.md`. Refuse to proceed if any is
   still `Status: draft` — ask the owner to approve first.
2. Read every file the task names, plus their tests and direct callers.
3. Make sure you are on a working branch off `main`, never `main` or `release/**` (pushing to `release/**`
   deploys to production). If not, create one following `<genre>/<specifics>` from `.claude/CLAUDE.md` → Git
   (`feature/<area>/<slug>` for features, `fix/<area>/<what>` for bugs) and tell the owner.
4. Baseline: `npm run typecheck` and `npx vitest run --exclude src/main.test.ts`. If they already fail, stop and
   report — don't build on a red baseline.

## For each task

1. **Tests first** for pure logic and services: write or extend `*.test.ts` beside the module using fakes and
   injected clocks/timers. Run them and see them fail for the right reason.
2. **Implement** the smallest change that satisfies the task's requirements, following `.claude/CLAUDE.md` and
   the path rules in `.claude/rules/`.
3. **Verify:** typecheck + the task's tests + the full unit suite. Fix until green.
4. **Self-review the diff** (`git diff`) against the checklist below.
5. Tick the checkbox in `tasks.md`. If you deviated from the design, update the feature `design.md` in the same
   step and mention it.
6. If more tasks remain and the owner asked for `all`, continue; otherwise stop and report.

## Self-review checklist

- [ ] No upward imports; commands only read options → call services → build replies.
- [ ] New exports have explicit return types and a one-line comment; new command files have the header.
- [ ] No `any`, `var`, nested ternaries; functions short; early returns.
- [ ] External data parsed from `unknown` with a type guard.
- [ ] No secrets, endpoint URLs, tokens in logs or replies; `allowedMentions: { parse: [] }` on sends.
- [ ] New caches/maps bounded with expiry; no new timers; no new dependency (or justified in the report).
- [ ] Access level and reply visibility match the requirement.
- [ ] Settings shape change → `defaultSettings()`, store test defaults, and old-file tolerance handled.
- [ ] Command `data` changed → zh-CN description entries added; flag `deploy-commands` in the report.

## Report

End with: tasks completed, files changed, test results (counts), any design deviations, and whether
`npm run deploy-commands` will be needed. Do not commit unless the owner asks.

## When stuck

If a task turns out to be wrong or much larger than planned, stop and propose a task-list edit instead of
silently expanding scope.
