# Milestones and worktrees

## Branch model

- Base branch: `production` at `25adb9d` (2026-10-21).
- One worktree and branch per milestone:
  - `m1-login-share` / `feat/m1-login-share`
  - `m2-dbml` / `feat/m2-dbml`
  - `m3-circles` / `feat/m3-circles`
- Merge order is M1 → M2 → M3. Worktrees isolate work; they do not make the
  shared files independent.

## Why sequential merging

The milestones share:

- `src/components/Workspace.jsx`
- `src/components/EditorHeader/ControlPanel.jsx`
- `src/pages/Editor.jsx`
- `src/data/schemas.js` / `src/data/constants.js`
- i18n locale files

Parallel code work on M2 and M3 would create avoidable conflicts. Parallel
read-only work (research, specs, review) is fine.

## Subagent rules

- The coordinator keeps scope, decisions, wiki and merges.
- Implementation subagents work inside one worktree and one ticket.
- Communicate through pointers: ticket path, wiki page, commit SHA, test output.
- A subagent report should contain only: changed files, commit SHA, commands
  run, failures, and open questions.
- After each milestone, run the `code-review` skill against the diff from the
  merge base, then merge.

## Housekeeping before the first worktree

At `25adb9d` these are untracked and therefore absent from worktrees:

- `AGENTS.md`
- `TODO`
- `docs/agents/`
- the new `docs/wiki/` and `docs/adr/`

They must be committed (or passed as absolute pointers) before implementation
starts. `codex-session-*.md` should be ignored, not committed.

## Recurring practice

After every milestone:

1. run lint/build/tests;
2. run two-browser checks where collaboration is involved;
3. run code review;
4. update the wiki and ADRs;
5. merge.

If the harness later supports schedules, a weekly wiki lint plus dependency audit
is the useful cadence.
