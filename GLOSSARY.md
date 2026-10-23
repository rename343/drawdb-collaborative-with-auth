# Glossary

Terms specific to this repository. Implementation details belong in code or
ADRs, not here.

## Collaboration

**Diagram edit lock**
An exclusive claim over one diagram for the duration of a DBML edit. See ADR
0002.
_Avoid_: DBML lock

**Table lock**
An exclusive claim over one table while a participant edits it.
_Avoid_: row lock, field lock

**DBML draft**
Text being edited in the DBML editor that has not yet been applied to the
diagram.
_Avoid_: DBML buffer, pending code

**Snapshot**
A complete diagram document at one version.
_Avoid_: document, state

## Circle annotations

**Circle annotation**
A visual-only specialization circle labelled `d` or `o`, with optional lines to
table edges. It does not connect keys. See ADR 0001.
_Avoid_: EER circle, subtype node

**Disjoint**
A specialization constraint where an instance belongs to at most one subtype;
rendered as `d`.
_Avoid_: exclusive

**Overlapping**
A specialization constraint where an instance may belong to multiple subtypes;
rendered as `o`.
_Avoid_: inclusive

**Total specialization**
A specialization completeness constraint where every supertype instance must
belong to a subtype; rendered as a double line.
_Avoid_: complete, mandatory

**Partial specialization**
A specialization completeness constraint where a supertype instance need not
belong to a subtype; rendered as a single line.
_Avoid_: optional
