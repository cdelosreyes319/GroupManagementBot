# Spec workflow

This folder replaces `.kiro/`. Kiro used one large requirements → design → tasks set for the whole v1 build
(27 tasks, all complete). Claude Code works better with **living baseline docs** plus **small per-feature specs**
that are folded back in when done.

```
.claude/specs/
├─ README.md            # this file
├─ requirements.md      # LIVING: every current requirement, numbered R1..Rn (as built)
├─ design.md            # LIVING: architecture, contracts, data models (as built)
├─ backlog.md           # drift, open questions, tech debt, ideas (B-numbered)
├─ history.md           # what was delivered and when (Kiro v1 + closed features)
├─ _template/           # copy for each new feature
│  ├─ requirements.md
│  ├─ design.md
│  └─ tasks.md
└─ features/
   └─ <slug>/           # one in-flight change; deleted (summarised in history.md) when closed
```

## Lifecycle of a change

```
idea ──/spec-new──▶ requirements ─(owner OK)─▶ design ─(owner OK)─▶ tasks ─(owner OK)
                                                                            │
     history.md ◀──/spec-close── verify (/checkpoint) ◀──/spec-implement────┘
```

1. **Requirements** (`features/<slug>/requirements.md`): user stories + EARS acceptance criteria
   (`WHEN … THEN the system SHALL …`). New requirements continue the global numbering (next free `R<n>`);
   changes to an existing requirement reference it (`Changes R4.1`). Owner approves before design.
2. **Design** (`features/<slug>/design.md`): only the delta against `design.md` — new/changed modules, types,
   flows, data-model changes, migration of `settings.json` if its shape changes, and the test plan. Owner
   approves before tasks.
3. **Tasks** (`features/<slug>/tasks.md`): ordered, checkbox tasks sized for one focused session each (a
   module + its tests, or one command). Each task names the files it touches, the requirements it satisfies,
   and its "done when" check. End with a checkpoint task.
4. **Implement** with `/spec-implement`. Tests first for pure logic. Tick boxes as you go. If reality forces a
   design change, update the feature `design.md` first and say so.
5. **Verify** with `/checkpoint <slug>`: typecheck, tests, build, `spec-auditor` pass, README updated,
   deploy-commands flagged if command definitions changed.
6. **Close** with `/spec-close <slug>`: merge the feature's requirements into `requirements.md` and its design
   delta into `design.md`, add a line to `history.md`, resolve any `backlog.md` entries, delete the feature
   folder.

## Writing good specs for this repo

- **Requirements say *what* and *why*, never *how*.** No file names in acceptance criteria unless the location
  itself is the requirement (e.g. "data-only file").
- **One behaviour per criterion**, testable. Use SHALL for must, SHOULD for best-effort, MAY for allowed.
- **Name the edge cases**: not linked in Bloxlink, not in group, rank at/above bot, deleted role, unreachable
  channel, endpoint timeout, Discord limits (see design.md → Discord limits).
- **State the reply visibility** (public vs ephemeral, R2.5–2.5b) and **access level** for any new command.
- **Design deltas stay small.** If a section of `design.md` is simply still true, reference it instead of
  copying it.
- **Tasks are outcomes, not keystrokes.** Opus can plan the edit; the task must pin down scope, requirements,
  files, and the verification step.

## Conventions

- Requirement IDs are stable forever. Retired criteria are marked `~~struck~~ (retired: reason)`, never
  renumbered.
- `as built` notes in the living docs record intentional deviations from earlier wording.
- `backlog.md` items are `B-<n>`; reference them from feature specs when a feature resolves one.
