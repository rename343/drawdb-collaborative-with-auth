# Verification

## Existing commands at 25adb9d

- `npm run lint`
- `npm run build`
- `npm run test:server`
- `npm run test:git`
- `npm run test:import`
- `npm run test:layout`

There is no browser test harness at this commit. UI checks are manual.

## TDD seams

### M1 — login and share

- `buildDiagramShareUrl(origin, diagramId)` is a pure function; add a Node test.
- Clipboard fallback is handled in the UI; verify manually in a secure context
  and by simulating a rejected `navigator.clipboard.writeText`.

### M2 — DBML and diagram lock

- Server lock manager: acquire, renew, release, expiry, release-on-disconnect,
  refusing writes from non-owners.
- DBML mapping: DBML source → diagram patch, including preservation of notes,
  areas, circles, pan/zoom and table positions by name.

### M3 — circles

- Geometry helpers: nearest table edge, circle-to-table path, link preview.
- Reference remapping after table deletion or DBML Apply.
- JSON schema round-trip for the `circles` array.

## Manual two-browser matrix

- Open the same diagram in two different browser profiles (different accounts).
- Verify lock state, read-only banners, apply/cancel, disconnect and reconnect.
- For M1, verify share links from `/editor/diagrams/:id` and `/diagrams/:id`,
  including the logged-out redirect through login.

## Login theme matrix

- App light + OS light.
- App light + OS dark.
- App dark + OS light.
- App dark + OS dark.
- Error banner visible; labels and hints readable; mobile width.

## M1 verification record — 2026-10-21

Commits: `15e8422` (login theme), `757c760` (share button).

Automated:

- `npm run test:share` — 4/4 pass.
- `npm run lint` — clean.
- `npm run build` — success, only pre-existing Vite warnings.
- `npm run test:server` — 17/17 pass.
- `npm run test:git` — 7/7 pass.
- `npm run test:import` — 2/2 pass.
- `npm run test:layout` — 28/28 pass.

Headless Chrome (local dev server, 2026-10-21):

- Login screenshots: app light/dark × OS light/dark; light page stayed light
  under `--force-dark-mode`; dark page matched in both OS modes.
- Mobile 390×844: light and dark render without clipping.
- Dark invalid-credentials banner is readable.
- Share enabled on `/diagrams/:id`; disabled on `/editor` and
  `/editor/templates/:id`; disabled tooltips show the correct reason.
- Headless clipboard denied, so the fallback modal appeared with the canonical
  URL and a working “Select link” action.
- A second account opened the canonical `/diagrams/:id` URL and saw the same
  diagram.

Remaining human smoke test:

- Real clipboard success path in a normal browser.
- Full login redirect after a logged-out user opens a share link.
