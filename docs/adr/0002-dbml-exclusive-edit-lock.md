# ADR 0002 — DBML exclusive diagram edit lock

- Date: 2026-10-21
- Status: accepted
- Deciders: repository owner, implementation agent

## Context

The DBML editor is currently read-only. Making it editable creates a conflict
between a local code draft and GUI edits that autosave whole-document snapshots.
Without coordination the first save wins; the other client receives
`RESYNC_REQUIRED` and its local state is replaced.

## Decision

Add a server-enforced, leased diagram edit lock for DBML editing.

- Default DBML mode is read-only.
- Entering edit mode acquires a lock for the whole diagram.
- While held, GUI editing is disabled for all participants, including the lock
  owner.
- The server rejects `snapshot.replace` operations from clients that do not own
  the lock.
- The lock is released on Apply, Cancel, panel close, disconnect, or lease
  expiry.
- Acquiring the lock fails while another participant holds a table lock;
  acquiring a table lock fails while the diagram lock is held.

## Consequences

- DBML editing is exclusive and conflict-free in normal use.
- A crashed tab blocks GUI editing only until the lease expires.
- The collaboration protocol gains a small lock message family and server tests.
- Full-document undo for DBML Apply is not included in the first version.
