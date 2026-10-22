# drawDB collaborative — working wiki

This wiki is the durable memory for the collaborative editor work. Claims about
code are dated and cite the commit they were true at. Sources (tickets, issues,
transcripts) are linked, never copied.

Last updated: 2026-10-21.

## Decisions

- [2026-10-21 — scope and sequencing](decisions/2026-10-21-scope.md) — M1/M2/M3
  scope, B+ circles, DBML lock, deferred bug.
- [ADR 0001 — circle annotations before EER](../../docs/adr/0001-circle-annotations-before-eer.md)
- [ADR 0002 — DBML exclusive diagram edit lock](../../docs/adr/0002-dbml-exclusive-edit-lock.md)

## Subsystems

- [Collaboration locks](subsystems/collaboration-locks.md) — table locks today,
  diagram edit lease planned.
- [DBML editor](subsystems/dbml-editor.md) — read-only view today, editable
  draft and exclusive mode planned.
- [Circle annotations](subsystems/circle-annotations.md) — B+ shape, drag
  connectors, non-goals.

## Workflow

- [Milestones and worktrees](workflow/milestones-and-worktrees.md) — branch,
  worktree, subagent and merge rules.
- [Verification](testing/verification.md) — commands, TDD seams, manual
  two-browser checks.

## Backlog and incidents

- [Field highlight bug](incidents/field-highlight-bug.md) — deferred; needs
  reproduction.
- [User preferences](user-preferences.md) — language, scope boundaries,
  workflow preferences.

## External sources

- Issue tracker: `.scratch/<feature>/` (see `docs/agents/issue-tracker.md`).
- Domain conventions: `docs/agents/domain.md`.
