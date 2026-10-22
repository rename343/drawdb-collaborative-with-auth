# 02 — Share button copies the canonical diagram link

Status: ready-for-agent
Blocked by: none

## Tasks

- Add a pure `buildDiagramShareUrl(origin, diagramId)` helper and a Node test.
- Add a visible header button using the historic pattern from `a13de8a^`.
- Copy `${origin}/diagrams/${id}`.
- Disable for templates and for diagrams without a saved id; explain in a
  tooltip.
- Toast on success; modal fallback when clipboard access fails.
- Reuse existing i18n keys `share`, `copy_link`, `copied_to_clipboard`; add only
  a failure message.
- Confirm `RequireAuth` returns a logged-out recipient to the diagram after
  login.

## Acceptance

- Works from `/editor/diagrams/:id` and `/diagrams/:id`.
- The copied URL opens the same diagram in another signed-in browser.
- No server or access-model changes.
