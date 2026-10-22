# Collaboration locks

## Table locks as of 25adb9d (2026-10-21)

- Server implementation: `server/tableLocks.js`.
- Lease: 12 s, renewed by clients every 4 s (`src/context/CollabContext.jsx`).
- Expiry sweeper: every 2 s (`server/websocket.js`).
- Locks are released on socket close.
- Clients acquire a table lock before editing or dragging a table.
- `TableInfo.jsx` retains a table lock while the table details panel is open.
- Table locks are advisory for GUI actions. The server only checks them for
  `table.move` previews; `snapshot.replace` saves are not blocked by a table
  lock.

## Planned diagram edit lock (M2)

- One lock per diagram, separate from table locks.
- Used by the DBML editor while it is in edit mode.
- Lease/renew semantics modelled on `server/tableLocks.js`.
- While held:
  - the owner may send DBML-driven `snapshot.replace` operations;
  - other clients' `snapshot.replace` operations are rejected;
  - GUI editing is disabled for everyone;
  - table-lock acquisition is refused.
- Acquiring the diagram lock fails while another participant holds a table
  lock. The client should release its own table locks before requesting it.
- Released on Apply, Cancel, panel close, socket close, or lease expiry.

## Why not reuse table locks

Reusing a sentinel table id would confuse table-lock state and still not enforce
anything for `snapshot.replace`. A separate lease manager and message family is
clearer and testable.

## Sources

- `server/tableLocks.js`, `server/websocket.js`, `src/context/CollabContext.jsx`
  at commit `25adb9d`.
- [ADR 0002](../../adr/0002-dbml-exclusive-edit-lock.md).
