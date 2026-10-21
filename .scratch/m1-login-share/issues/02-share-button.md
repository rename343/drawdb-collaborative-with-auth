# 02 — Share button copies the canonical diagram link

Status: resolved
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

## Comments

2026-10-21 — Implemented in `757c760` as `ShareButton.jsx`. The pure URL helper
is covered by four Node tests. Headless Chrome verified the enabled state on a
saved diagram, the disabled state and tooltip on `/editor` and templates, the
clipboard-failure fallback with “Select link”, and a second account opening the
canonical URL. The real clipboard success path still needs a normal-browser
smoke test.
