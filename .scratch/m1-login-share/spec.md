# Spec — M1 login theme and share button

Status: ready-for-agent
Date: 2026-10-21

## Problem

1. The login page uses Tailwind `dark:` classes, which follow the operating
   system preference, while the rest of the application uses
   `body[theme-mode]`. This produces low-contrast combinations.
2. There is no visible way to copy the current diagram link.

## Scope

### Login

- Follow the user's saved light/dark setting.
- Do not force light mode.
- Keep the existing login/register/setup flows unchanged.
- Improve contrast and focus states for labels, hints, links, inputs, error
  banner and card.
- Make the logo readable in both themes.

### Share

- Add a visible `Share` button to the editor header.
- Copy the canonical `${origin}/diagrams/${id}` URL.
- Disable the action for unsaved/template diagrams with an explanatory tooltip.
- Show a success toast and a clipboard-failure fallback.
- Do not change the access model.

## Non-goals

- Per-diagram permissions.
- Sharing from the diagram list.
- Any change to server endpoints.

## Acceptance

- Login is readable in app-light/app-dark with either OS preference.
- Share copies a link that opens the same diagram in another signed-in browser.
- A logged-out recipient is sent through login and returned to the diagram.
- Lint and build pass.
