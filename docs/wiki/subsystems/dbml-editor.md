# DBML editor

## State at 25adb9d (2026-10-21)

- Component: `src/components/EditorSidePanel/DBMLEditor.jsx`.
- Rendered in the side panel when `layout.dbmlEditor` is true.
- Monaco options hard-code `readOnly: true`.
- The displayed value is regenerated from the diagram whenever tables, enums or
  relationships change.
- The editor is opened with `Alt+E` or the View menu.
- `toDBML` lives in `src/utils/exportAs/dbml.js`.
- `fromDBML` lives in `src/utils/importFrom/dbml.js` and is already used by the
  DBML file import flow. It is lazily loaded because the parser is large.

## Planned M2 behaviour

1. Default mode is read-only ("Podgląd").
2. Entering edit mode acquires a diagram-wide lease from the server.
3. The code becomes a local draft. Remote diagram changes do not overwrite a
   dirty draft.
4. Apply parses the draft with `fromDBML`, validates it, replaces tables,
   relationships and enums, and preserves notes, areas, circles, types and
   pan/zoom. Table positions are preserved by matching table names where
   possible.
5. Apply sends one `snapshot.replace` with the current base version, then
   releases the lock.
6. Parse errors keep the draft and the lock so the user can fix them.
7. Cancel discards the draft and releases the lock.
8. A disconnect or lease expiry releases the lock server-side.

## Non-goals for M2

- Live two-way sync on every keystroke.
- DBML support for circles or notes.
- Full-document undo for Apply (clear undo/redo in the first version; revisit if
  needed).

## Sources

- `src/components/EditorSidePanel/DBMLEditor.jsx`,
  `src/utils/importFrom/dbml.js`, `src/utils/exportAs/dbml.js` at `25adb9d`.
- [ADR 0002](../../adr/0002-dbml-exclusive-edit-lock.md).
