# ADR 0001 — Circle annotations before EER semantics

- Date: 2026-10-21
- Status: accepted
- Deciders: repository owner, implementation agent

## Context

The TODO asks for "circles (disjoint and overlapping)". Full EER subtype
relationships would require a new data model, key propagation, validation,
import/export work and SQL generation. The user wants the visual notation first
and explicitly does not want key semantics yet.

## Decision

Implement a visual-only circle annotation (variant B+):

- circle with `d`/`o` label;
- optional double line for total specialization;
- drag-created lines to table edges;
- optional parent and multiple children by table id;
- no field/key references, no foreign-key creation, no SQL/DBML semantics.

## Consequences

- Users can draw EER-looking specialization diagrams and annotate them manually.
- SQL export does not represent specialization.
- The document schema leaves room to add real subtype semantics later.
- A future EER epic can extend or replace the annotation model without claiming
  that the current circles are semantically enforced.
