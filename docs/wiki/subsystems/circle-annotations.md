# Circle annotations (variant B+)

## Intent

Add EER-looking specialization circles without implementing EER semantics. The
circle is a diagram annotation; it does not create keys or relationships.

## Planned document shape

```js
{
  id,
  x,
  y,
  radius,
  color,
  constraint: "disjoint" | "overlapping",
  completeness: "partial" | "total",
  parentTableId: string | null,
  childTableIds: string[]
}
```

- `constraint` renders `d` or `o` inside the circle.
- `completeness` controls a single vs double line from the parent table to the
  circle.
- `parentTableId` and `childTableIds` point at table ids only. They never point
  at fields or keys.
- Lines attach to the nearest table edge, not to a field row.

## Interaction

- Add circle from the toolbar.
- Select, drag and resize.
- A selected circle shows two drag handles:
  - parent handle: drag to one table, replaces the current parent;
  - child handle: drag to a table, adds a child.
- Drop target is highlighted; self-links and duplicates are ignored.
- The circle editor lists connected tables so links can be removed without
  clicking a thin line.

## Persistence and collaboration

- Stored in the diagram document as `circles`.
- Included in JSON export/import.
- Preserved when DBML Apply replaces tables; references are remapped by table
  name where possible, otherwise cleared.
- Collaboration uses the existing whole-document snapshot flow. No new protocol
  messages are needed.
- SQL and DBML exports ignore circles.

## Explicit non-goals

- Creating or connecting foreign keys.
- Propagating primary keys to child tables.
- `INHERITS` or SQL inheritance generation.
- Validating disjoint/overlapping constraints.
- Appearing in the Relationships tab.

Those belong to the future EER epic.

## Sources

- Conversation with the repository owner, 2026-10-21.
- [ADR 0001](../../adr/0001-circle-annotations-before-eer.md).
