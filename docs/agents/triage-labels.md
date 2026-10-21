# Triage labels

For local implementation tickets, record a `Status:` line using this mapping.

| Canonical role    | Local status      | Meaning                                            |
| ----------------- | ----------------- | -------------------------------------------------- |
| `needs-triage`    | `needs-triage`    | Maintainer needs to evaluate the issue.            |
| `needs-info`      | `needs-info`      | Waiting for more information.                      |
| `ready-for-agent` | `ready-for-agent` | Fully specified and ready for an autonomous agent. |
| `ready-for-human` | `ready-for-human` | Requires human implementation.                     |
| `wontfix`         | `wontfix`         | Will not be actioned.                              |

When a skill refers to a triage role, use the corresponding local status.
For example: `Status: needs-triage`.
