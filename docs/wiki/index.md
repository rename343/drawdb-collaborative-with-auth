# drawDB collaborative — working wiki

This wiki is the durable memory for the collaborative editor work. Claims about
code are dated and cite the commit they were true at. Sources (tickets, issues,
transcripts) are linked, never copied.

Last updated: 2026-10-22.

## Implementation status

**2026-10-22**

- Docs, M1 and CI are merged. At 11:42 UTC, `main` = `production` = `dc59115`;
  PR #3 (`7d7b3ff`) added the agent docs and wiki, PR #4 (`137ae46`) M1, PR #2
  (`d604f5e`) main validation, and PR #5 (`dc59115`) manual Docker dispatch.
  See the [Merge log](workflow/merge-log.md).
- M1 login theme + share button is merged at `137ae46`; implementation commits
  are `15e8422` and `757c760`. Automated and headless-browser checks passed
  ([Verification](testing/verification.md)). Manual smoke tests still
  outstanding: real OS clipboard success and the full logged-out → login →
  diagram redirect in a normal browser.
- M2 needs a rebuild. `feat/m2-dbml` is at `d3a5919` (server diagram edit lock)
  on the old M1 history (`e1a5375`, `a9d5cb8`, `b6dc23b`) and is not merged.
  Rebuild it onto `dc59115` before further M2 work. Tickets:
  [`.scratch/m2-dbml/issues/`](https://github.com/rename343/drawdb-collaborative-with-auth/tree/feat/m2-dbml/.scratch/m2-dbml/issues)
  `01-server-diagram-lock.md` through `04-verify-m2.md`. See
  [DBML editor](subsystems/dbml-editor.md).

**2026-10-21 (historical)**

- M1 login theme + share button: implemented on `feat/m1-login-share` in
  `15e8422` and `757c760`; automated and headless-browser checks recorded in
  [Verification](testing/verification.md). A normal-browser clipboard smoke test
  remains. **Superseded 2026-10-22 by the merged status above.**

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

- [Merge log](workflow/merge-log.md) — dated merges into `main`, checks and
  image tags.
- [Milestones and worktrees](workflow/milestones-and-worktrees.md) — branch,
  worktree, subagent and merge rules.
- [Verification](testing/verification.md) — commands, TDD seams, manual
  two-browser checks.

## Backlog and incidents

- [Security backlog (2026-10-22)](backlog/security-2026-10-22.md) — 17 open
  Dependabot and 15 open CodeQL alerts at `dc59115`, with the runtime versus
  development split.
- [Field highlight bug](incidents/field-highlight-bug.md) — deferred; needs
  reproduction.
- [User preferences](user-preferences.md) — language, scope boundaries,
  workflow preferences.

## External sources

- Issue tracker: `.scratch/<feature>/` (see `docs/agents/issue-tracker.md`).
- Domain conventions: `docs/agents/domain.md`.
