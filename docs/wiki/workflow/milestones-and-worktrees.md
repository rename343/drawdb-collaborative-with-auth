# Milestones and worktrees

## Branch model

- Base branch: `production` at `25adb9d` (2026-10-21).
- One worktree and branch per milestone:
  - `m1-login-share` / `feat/m1-login-share`
  - `m2-dbml` / `feat/m2-dbml`
  - `m3-circles` / `feat/m3-circles`
- Merge order is M1 → M2 → M3. Worktrees isolate work; they do not make the
  shared files independent.

## Base branch note — 2026-10-22

This supersedes the `25adb9d` base-branch line above for current work.

- `main` = `production` = `dc59115` at 11:42 UTC on 2026-10-22. `25adb9d` is
  historical. Docs, M1 and CI merged through PRs #3, #4, #2 and #5; see the
  [Merge log](merge-log.md).
- Docs housekeeping completed in `7d7b3ff` (PR #3) for `AGENTS.md`,
  `docs/agents/`, `docs/wiki/` and `docs/adr/`. The root `TODO` was committed
  there too, then retired on 2026-10-22 in `e854457` (PR #6); open work lives in
  `.scratch/backlog/issues/` and `.scratch/security/issues/`. The "Housekeeping
  before the first worktree" section below is historical.
- `feat/m2-dbml` is stale. It is at `d3a5919` (server diagram edit lock) and was
  built on the old M1 history (`e1a5375`, `a9d5cb8`, `b6dc23b`), not on current
  `main`. It is unmerged; rebuild it onto `f1ee606` (2026-10-22) before further
  M2 work.
- Later on 2026-10-22, `main` = `production` = `f1ee606` after PRs #6, #7 and
  #8. See the [Merge log](merge-log.md).

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
