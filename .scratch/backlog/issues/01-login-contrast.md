# 01 — Login screen contrast

Status: needs-triage
Blocked by: none

## Tasks

- Verify the current login screen in all four theme combinations: app light/dark
  × OS light/dark.
- Check normal text against the 4.5:1 contrast target, including labels, hints,
  links, error banner and the logo.
- If the report still reproduces, fix it with theme-aware tokens.

## Acceptance

- No white-on-white or dark-on-dark text.
- Normal text contrast at least 4.5:1.
- Register and setup-required screens match the login screen.

## Comments

2026-10-22 — Migrated from the retired root `TODO`. M1 reworked login theming in
`15e8422`, merged to `main` in `137ae46`, so the original report may be stale.
Verify before implementing.

Sources: `.scratch/m1-login-share/issues/01-login-theme.md`,
`docs/wiki/testing/verification.md`.
