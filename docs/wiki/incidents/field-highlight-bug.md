# Field highlight bug (deferred)

Reported in the root `TODO` on 2026-10-21 (retired 2026-10-22 in `e854457`):
fields appear highlighted even though nobody is editing them. Tracked in
`.scratch/backlog/issues/04-field-highlight-bug.md`.

Status on 2026-10-21: deferred. Do not work on it until a reliable reproduction
exists.

## Unverified hypotheses

1. `TableInfo.jsx` acquires a table lock when the details panel opens, not when
   the user starts editing. Other clients see the lock badge/overlay.
2. `Table.jsx` keeps `hoveredField` state in React; a remote re-render or table
   movement under a stationary pointer can leave it set.
3. `TableField.jsx` sets `validateStatus="error"` for inherited fields, so they
   are permanently outlined red even without editing.

## What a reproduction must include

- one tab or two tabs;
- who is signed in;
- which element is highlighted (input in side panel vs row on canvas);
- whether a collaborator name or lock badge is visible;
- whether it clears on mouse move, panel close, refresh, or after ~12 s.
