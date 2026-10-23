# ADR 0003 — Snapshot-authoritative collaboration and one lease registry

- Date: 2026-10-22
- Status: accepted
- Deciders: repository owner, implementation agent

## Context

The client mixed WebSocket handling, protocol encoding, lock timers, retention
counters, snapshot versions and React state in `CollabContext`. Five contexts
emitted per-entity deltas that the collaboration layer silently dropped, so the
code appeared to synchronise operations but only forwarded an ephemeral table
move. The server had separate table-lock and diagram-lock managers with the same
lease and fencing logic.

## Decision

- A **Snapshot** is the only authoritative unit of document synchronisation.
  Per-entity deltas are removed. Ephemeral awareness (cursor and table move
  preview) stays, but is owned by the collaboration module rather than contexts.
- The client is a framework-agnostic **collaboration session** behind small
  ports: transport, clock, document and snapshot writer. A React adapter exposes
  `useTableLocks`, `useTableAction` and `useDiagramEdit`. Callers declare
  intent; the session owns refcounts, retries, renewals, grace release,
  reconnect and autosave suppression.
- One server **lock registry** owns both Table locks and the Diagram edit lock,
  with shared lease, fencing and expiry. A single `checkWrite` gate covers
  WebSocket `snapshot.replace`, HTTP `PUT` and Git pull. HTTP and Git reject
  writes whenever any Diagram edit lock exists; WebSocket allows its owner.
- Losing the Diagram edit lock is a `lost` state. The draft is kept, the lock is
  not reacquired automatically, and re-entering edit mode obtains a fresh
  Snapshot. Table locks may resume after reconnect.
- Applying DBML flushes pending saves, sends one snapshot and releases the lock
  only after the server acknowledges it.
- Table locks remain UI coordination plus preview enforcement. A
  `snapshot.replace` is not diffed against locked tables; optimistic
  `baseVersion` still rejects concurrent writes.

## Consequences

- M2 builds on `useDiagramEdit` and `commit` instead of adding lock handling to
  `CollabContext`.
- Lock behaviour is testable at the session and registry interfaces with fake
  clocks and transports; React rendering and real timers are not required.
- The wire format stays compatible, but clients must handle the diagram-lock
  message family.
- A future decision is needed if table locks must reject changes inside a
  snapshot.
