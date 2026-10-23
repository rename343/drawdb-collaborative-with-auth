# Project board: DrawDB Roadmap

Roadmap work is tracked on a GitHub Project.

| Property | Value                                                |
| -------- | ---------------------------------------------------- |
| Name     | DrawDB Roadmap                                       |
| Number   | 2                                                    |
| Owner    | rename343                                            |
| URL      | https://github.com/users/rename343/projects/2        |

## Fields

`Koszyk` is a single-select field with three options:

| Option         | Translation    |
| -------------- | -------------- |
| `Teraz`        | Now            |
| `Duże funkcje` | Large features |
| `Luźne`        | Loose          |

`Status` is the built-in project field: `Todo`, `In Progress`, `Done`.

## Commands

Add an issue to the board:

```bash
gh project item-add 2 --owner rename343 --url <issue-url>
```

Set the `Koszyk` field:

```bash
gh project item-edit 2 --owner rename343 --url <issue-url> --field Koszyk --value "Teraz"
```

Set the `Status` field:

```bash
gh project item-edit 2 --owner rename343 --url <issue-url> --field Status --value Done
```

`--url` accepts an issue or PR URL. Values must match the option names exactly,
including Polish diacritics and capitalisation.

## Repo inference

- `gh project` commands are owner-scoped: they use `--owner rename343` and do
  not accept `--repo`.
- For `gh issue` and `gh pr` commands that fail to infer the repository, pass
  `--repo rename343/drawdb-collaborative-with-auth` or set `GH_REPO`:

```bash
gh issue view <number> --repo rename343/drawdb-collaborative-with-auth
# or
export GH_REPO=rename343/drawdb-collaborative-with-auth
```
