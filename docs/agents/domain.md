# Domain docs

## Layout

This repository uses a single-context layout:

- `GLOSSARY.md` at the repository root contains shared domain vocabulary.
- `docs/adr/NNNN-<decision>.md` contains architecture decision records.

## Consumer rules

- Before exploring an area, read the glossary if present and the ADRs relevant to that area.
- When these documents are absent, continue with the available code and documentation. The `domain-modeling` skill creates entries when concrete terms or decisions are resolved.
- Use the glossary's defined vocabulary in issues, proposals, hypotheses, and test names.
- If a needed concept is missing, check existing project terminology; record a genuine gap for `domain-modeling`.
- When a proposal conflicts with an ADR, cite the ADR and explain why the decision should be reopened.
