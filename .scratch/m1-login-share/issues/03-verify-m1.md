# 03 — Verify M1 and update docs

Status: ready-for-human
Blocked by: 01, 02

## Tasks

- Run `npm run lint` and `npm run build`.
- Run the new share URL test.
- Perform the login theme matrix.
- Perform the two-browser share check.
- Update `docs/wiki/decisions/2026-10-21-scope.md` if implementation differs.
- Record the final commit SHA in the wiki.

## Acceptance

- All checks pass or have a documented reason.
- The wiki contains the implemented behaviour and the commit reference.

## Comments

2026-10-21 — Automated suites pass; the wiki now records `15e8422` and
`757c760`. Headless Chrome covered the theme matrix, mobile widths, error
banner, share enabled/disabled states, tooltips, fallback modal and a second
account opening the canonical URL.

Human smoke test remaining: confirm the real clipboard success path and the full
logged-out → login → diagram redirect in a normal browser.
