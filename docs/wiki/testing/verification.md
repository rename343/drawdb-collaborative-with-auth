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
