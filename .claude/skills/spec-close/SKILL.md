---
name: spec-close
description: Close a finished GroupManagementBot feature spec - merge its requirements and design delta into the living .claude/specs/requirements.md and design.md, record it in history.md, resolve backlog items, and remove the feature folder. Use after /checkpoint passes for a feature.
argument-hint: <slug>
---

# Close a feature spec

Input: `$ARGUMENTS` = `<slug>`.

1. Confirm every task in `.claude/specs/features/<slug>/tasks.md` is ticked and the last `/checkpoint` passed.
   If not, stop and say what's missing.
2. **Requirements:** append new `R<n>` sections to `.claude/specs/requirements.md` in number order, in the same
   format as the existing ones (`### Requirement <n>: <Title>`, user story, numbered criteria). Apply "Changes to
   existing requirements" in place; mark retired criteria `~~text~~ (retired <date>: reason)`. Never renumber.
3. **Design:** fold the delta into `.claude/specs/design.md` — update the folder layout, the relevant section
   (contracts, flows, data models, LIMITS table, command table). The result should read as if it was always
   written that way; no "feature X added…" narration.
4. **Backlog:** move items the feature resolved to "Resolved" in `backlog.md` with the date and slug. Add any new
   debt discovered during implementation as new `B-<n>` items.
5. **History:** add a row to the "Claude Code era" table in `history.md`.
6. Delete `.claude/specs/features/<slug>/`.
7. Show the owner a short summary of the doc changes. Remind them about `npm run deploy-commands` if command
   definitions changed. Don't commit unless asked.
