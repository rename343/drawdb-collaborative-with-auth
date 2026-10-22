# Glossary

Terms used in this repository. Claims about code are dated where relevant.

- **Diagram edit lock** — a server-enforced, leased exclusive lock over one
  diagram. Planned for DBML edit mode. See ADR 0002.
- **Table lock** — a per-table advisory lock used by GUI editing. As of
  2026-10-21 it is implemented in `server/tableLocks.js` and renewed every 4 s.
- **DBML draft** — the local text in the DBML editor that has not yet been
  applied to the diagram.
- **Circle annotation** — a visual-only specialization circle labelled `d` or
  `o`, with optional lines to table edges. It does not connect keys. See ADR
  0001.
- **Disjoint** — EER constraint rendered as `d`; an instance belongs to at most
  one subtype. In this repository, visual only as of 2026-10-21.
- **Overlapping** — EER constraint rendered as `o`; an instance may belong to
  multiple subtypes. Visual only as of 2026-10-21.
- **Total specialization** — EER completeness constraint rendered as a double
  line from the supertype to the specialization circle. Visual only as of
  2026-10-21.
- **Partial specialization** — single line from supertype to circle.
- **Snapshot** — the whole diagram document persisted by the server and
  broadcast to collaborators.
- **Worktree** — a separate checkout used to isolate a milestone branch.
