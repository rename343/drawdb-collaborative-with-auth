# Issue tracker: Local Markdown

Issues and specs live as Markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`.
- The spec is `.scratch/<feature-slug>/spec.md`.
- Implementation tickets are separate files at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`.
- Record triage state as a `Status:` line near the top of each ticket, using the strings in `triage-labels.md`.
- Append discussion under a `## Comments` heading at the bottom of the ticket.

## Publishing and fetching

When a skill says to publish to the issue tracker, create the appropriate spec
or ticket file using these conventions. When fetching a ticket, read the path
provided by the user or resolve its number within the referenced feature.

## Wayfinding operations

For `/wayfinder`, keep the map in `.scratch/<effort>/map.md` with Notes,
Decisions-so-far, and Fog sections. Store one child ticket per question in
`.scratch/<effort>/issues/NN-<slug>.md`.

- Record the ticket type as `Type: research`, `prototype`, `grilling`, or `task`.
- Record dependencies as `Blocked by: NN, NN` near the top.
- A ticket is unblocked when every dependency is `resolved`.
- Choose the lowest-numbered open, unblocked, unclaimed ticket next.
- Claim it by saving `Status: claimed` before starting work.
- Resolve it by appending an `## Answer`, saving `Status: resolved`, and adding a short summary and link to the map's Decisions-so-far section.

Wayfinding's `claimed` and `resolved` states apply to its child tickets;
implementation ticket triage uses the mapping in `triage-labels.md`.
