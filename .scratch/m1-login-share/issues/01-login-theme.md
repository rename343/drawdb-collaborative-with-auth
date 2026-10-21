# 01 — Login follows saved theme with correct contrast

Status: resolved
Blocked by: none

## Tasks

- Remove reliance on media-query `dark:` classes in `src/pages/Login.jsx`.
- Use theme-aware Semi variables or explicit `settings.mode` classes.
- Fix background, card, labels, hints, links, error banner, focus states.
- Make the logo readable on both backgrounds.
- Verify the four theme combinations from `docs/wiki/testing/verification.md`.

## Acceptance

- No white-on-white or dark-on-dark text.
- Normal text contrast at least 4.5:1.
- Register and setup-required screens match the login screen.
- Mobile layout remains usable.

## Comments

2026-10-21 — Implemented in `15e8422`. Login now uses Semi theme tokens and a
`[theme-mode="dark"]` selector instead of media-query `dark:` classes. Headless
Chrome verified app light/dark with OS light/dark, mobile widths and the dark
error banner. Register/setup screens reuse the same page and styles.
