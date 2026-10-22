# 01 — Configure Dependabot

Status: ready-for-agent
Blocked by: none

## Tasks

- Add `.github/dependabot.yml`: npm ecosystem, weekly schedule, grouped
  development and production updates, a sensible open-PR limit, target `main`.
- Run `npm audit fix` without `--force` and verify with lint, build and the
  existing test suites.
- Do not take breaking major upgrades, including `react-router-dom` 7, without a
  separate decision.

## Acceptance

- Dependabot opens grouped PRs against `main`.
- The lockfile is either unchanged or fixed without breaking checks.
- Before/after audit counts are recorded on the PR.

## Comments

2026-10-22 — Migrated from the retired root `TODO`. Work in progress in the
`dependabot` worktree on branch `chore/dependabot-config`.
