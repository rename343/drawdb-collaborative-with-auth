# 02 — Fix CodeQL alerts

Status: needs-triage
Blocked by: none

## Tasks

- Path injection in `server/gitSync.js` and `server/index.js`.
- Missing rate limiting in `server/index.js`.
- XSS through DOM in `src/components/LexicalEditor/ToolbarPlugin.jsx`.
- Polynomial ReDoS in `server/git.js`.
- Missing workflow permissions in `.github/workflows/build.yml`.

## Acceptance

- Each alert is fixed or dismissed with a written reason.
- Server tests cover the changed paths.

## Comments

2026-10-22 — Snapshot at `dc59115`: 15 open alerts, 14 high and 1 medium.
Path injection points: `server/gitSync.js` lines 119, 120, 164, 167, 174, 241,
335, 340, 345 and `server/index.js:74`. Rate limiting: `server/index.js:571`
and `:573`. XSS: `ToolbarPlugin.jsx:207`. ReDoS: `server/git.js:82`. Workflow
permissions: `build.yml:13`.

Sources: repository code-scanning alerts,
`docs/wiki/backlog/security-2026-10-22.md`.
