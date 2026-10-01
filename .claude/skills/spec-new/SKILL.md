---
name: spec-new
description: Start a new feature or behaviour change for GroupManagementBot as a spec in .claude/specs/features/<slug>/ (requirements → design → tasks), pausing for owner approval between phases. Use when the user describes a new feature, a behaviour change, or a backlog item to tackle that touches more than a line or two.
argument-hint: <short description of the feature or a backlog id like B-3>
---

# Create a feature spec

Input: `$ARGUMENTS` — a feature idea, or a backlog id (`B-n`) from `.claude/specs/backlog.md`.

## 0. Ground yourself (no writing yet)

1. Read `.claude/specs/README.md`, then the relevant parts of `.claude/specs/requirements.md` and
   `.claude/specs/design.md`. If a backlog id was given, read that entry.
2. Read the code the change will touch. Confirm the as-built behaviour yourself; do not trust the docs blindly.
3. Find the next free requirement number (`grep -n '^### Requirement\|^### R[0-9]' .claude/specs/requirements.md`
   and any open `features/*/requirements.md`).
4. Pick a kebab-case slug (≤4 words). Create `.claude/specs/features/<slug>/`.

If the request is ambiguous in a way that changes behaviour (who may use it, public vs ephemeral, limits,
what happens on failure), ask the owner **once**, with concrete options and your recommendation, before
writing requirements. Don't ask about things the codebase conventions already decide.

## 1. Requirements

Copy `.claude/specs/_template/requirements.md` to the feature folder and fill it in:

- EARS criteria (`WHEN … THEN the system SHALL …`), one behaviour each, testable.
- Always state the access level and reply visibility for any new or changed command.
- Cover failure paths: not linked in Bloxlink, not in group, rank limits, deleted roles, unreachable channels,
  timeouts, Discord limits, restart persistence.
- Changes to existing criteria go under "Changes to existing requirements" with the old ID.
- Security: no secrets in logs/replies; mentions disabled unless the requirement says otherwise.

**Stop.** Show the owner a short summary (the user stories plus anything non-obvious) and ask for approval or
edits. Do not continue until approved. Set `Status: approved` when they agree.

## 2. Design (delta only)

Copy `_template/design.md` and fill it in. Only describe what changes against `design.md`:

- Module table with layer for each file; verify no upward imports and no business logic in commands.
- Exported types/signatures. Prefer pure functions + `create*(deps)` factories so everything new is testable
  with fakes.
- Data model changes and how existing `settings.json` / `events.json` files on the server behave (missing
  top-level keys are filled from `defaultSettings()` on load; nested keys inside existing entries are not).
- Discord surface: definitions changed → `deploy-commands` needed; zh-CN descriptions; custom-ID prefix; log
  detail line.
- Resource check: every new cache/map bounded with expiry; no new timers; no heavy dependencies.
- Test plan, including what can only be checked manually in Discord.

**Stop.** Summarise the design decisions for the owner and get approval.

## 3. Tasks

Copy `_template/tasks.md`. Write 3–8 ordered tasks:

- Each is an outcome sized for one focused session (a pure module + its tests, a service, one command's
  wiring), with files, requirement IDs, and a concrete "done when".
- Pure logic and its tests come before the command/interaction glue that uses them.
- Include a docs task (README, i18n) if user-facing behaviour changes, and finish with a checkpoint task.

**Stop.** Show the task list and get approval. Then tell the owner to run `/spec-implement <slug>`.

## Rules

- Do not write production code in this skill.
- Keep specs short. A design section that is "unchanged" should say so in one line, not repeat `design.md`.
