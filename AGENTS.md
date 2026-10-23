## Agent skills

### Issue tracker

GitHub Issues. `.scratch/` is ignored local scratch space, not a tracker. For
issue and spec operations, read `docs/agents/issue-tracker.md`.

### Triage labels

Use the five canonical triage labels. When triaging, read
`docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/`. Before exploring the domain, read
`docs/agents/domain.md`.

### Working agreements

- Communicate with the repository owner in Polish.
- Prefer incremental delivery; do not implement the whole roadmap at once.
- Use git worktrees to isolate milestones, but merge sequentially because the
  milestones share core files.
