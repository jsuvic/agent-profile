# Task Ledger

Index only - task content lives in the linked issue briefs.
States: `ready | blocked | sequenced | parallel-safe | human-gate | in-progress | done`

## phase-24: Workflow Upgrade (`docs/specs/phase-24/001-workflow-upgrade-skills.md`)

| Id | Task | State | Brief |
| --- | --- | --- | --- |
| I1 | Skill invocation policy (flag table + per-target pin) | ready | [001-skill-invocation-policy.md](docs/specs/phase-24/issues/001-skill-invocation-policy.md) |
| I2 | Grill + synthesis content (Design-it-Twice, Seam & Interface Design, writes) | ready | [002-grill-synthesis-content.md](docs/specs/phase-24/issues/002-grill-synthesis-content.md) |
| I3 | TDD enforcement content (anti-patterns, mock boundary, escape hatch) | ready | [003-tdd-enforcement-content.md](docs/specs/phase-24/issues/003-tdd-enforcement-content.md) |
| I4 | implement-next skill + emission rule | sequenced (after I1, I2) | [004-implement-next-skill.md](docs/specs/phase-24/issues/004-implement-next-skill.md) |
| I5 | Informational doctor notes + docs | sequenced (after I2, I4) | [005-doctor-informational-notes.md](docs/specs/phase-24/issues/005-doctor-informational-notes.md) |

Recommended merge order (shared content files): I2 -> I3 -> I1 -> I4 -> I5.
