# Merge log

Chronological record of merges into `main`. Times are merge-commit times in UTC.
Later merges belong in a new dated section; this page is not a live branch view.

## 2026-10-22 — docs, M1 and CI to `dc59115`

Repository: `rename343/drawdb-collaborative-with-auth`.

| Order | PR | Source branch | Merge commit | Time (UTC) | Method |
| ----- | -- | ------------- | ------------ | ---------- | ------ |
| 1 | [#3](https://github.com/rename343/drawdb-collaborative-with-auth/pull/3) | `chore/agent-docs` | `7d7b3ff` | 11:31 | GitHub merge |
| 2 | [#4](https://github.com/rename343/drawdb-collaborative-with-auth/pull/4) | `feat/m1-login-share` | `137ae46` | 11:32 | GitHub merge |
| 3 | [#2](https://github.com/rename343/drawdb-collaborative-with-auth/pull/2) | `chore/ci-main-validation` | `d604f5e` | 11:33 | Local signed merge, pushed |
| 4 | [#5](https://github.com/rename343/drawdb-collaborative-with-auth/pull/5) | `chore/docker-dispatch` | `dc59115` | 11:42 | Local signed merge, pushed |

At 11:42 UTC on 2026-10-22, `main` = `production` = `dc59115`.

### Provenance and branch protection

- PRs #3 and #4 were merged through GitHub and produced merge commits
  `7d7b3ff` and `137ae46`.
- PRs #2 and #5 change `.github/workflows`. The `gh` token has `repo` but not
  the `workflow` OAuth scope, so they were merged as signed local merge commits
  and pushed. GitHub records both PRs as merged with those merge commits:
  `d604f5e` and `dc59115`.
- Both local merge commits show GitHub verification `verified=true` (checked
  2026-10-22).
- `main` has the ruleset "Block deletion and force". Its rules are deletion and
  `non_fast_forward` only, so fast-forward pushes are allowed.

### Checks after the merges

- Build — passed on Node 20.x and 22.x
  ([39772638531](https://github.com/rename343/drawdb-collaborative-with-auth/actions/runs/39772638531)).
- Docker `validate` — all 15 steps passed, including `npm ci`,
  `npm audit --omit=dev --audit-level=high`, `check:server`, `lint`, `build`,
  `test:server`, `test:git`, `test:import`, `test:layout`, `test:share`, and the
  deploy shell syntax/update/backup tests.
- CodeQL — passed
  ([39772638099](https://github.com/rename343/drawdb-collaborative-with-auth/actions/runs/39772638099)).
- Docker run
  [39772672186](https://github.com/rename343/drawdb-collaborative-with-auth/actions/runs/39772672186)
  published `ghcr.io/rename343/drawdb-collaborative-with-auth:production` and
  `ghcr.io/rename343/drawdb-collaborative-with-auth:dc59115`.

The Actions permission failure that preceded these runs is recorded in
[Verification](../testing/verification.md).

## Sources

- Pull requests [#2](https://github.com/rename343/drawdb-collaborative-with-auth/pull/2),
  [#3](https://github.com/rename343/drawdb-collaborative-with-auth/pull/3),
  [#4](https://github.com/rename343/drawdb-collaborative-with-auth/pull/4) and
  [#5](https://github.com/rename343/drawdb-collaborative-with-auth/pull/5).
- Docker run
  [39772672186](https://github.com/rename343/drawdb-collaborative-with-auth/actions/runs/39772672186).
- Git history and GitHub repository settings/APIs read on 2026-10-22.
