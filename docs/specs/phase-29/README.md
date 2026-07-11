# Phase 29

Tabnine workflow skills: Tabnine CLI now discovers Agent Skills from the
shared `.agents/skills/` convention (same SKILL.md format APC already
emits for Codex), so setups with Tabnine enabled emit the
instruction-only workflow and loop skills there - one file per skill, no
duplication, guidelines unchanged as the always-read layer. Tabnine
subagents stay excluded while experimental-flag-gated.

## Specs

- `001-tabnine-workflow-skills.md` - approved 2026-07-10 (accepts ADR
  0013). Does not supersede ADR 0007 (that ADR's logging-topic decision
  stands); ADR 0007 gets only a dated staleness note on one rationale
  premise.

## Issues

Issue brief on spec approval (single issue I1: emission-condition
extension, delegation exclusions + compile note, goldens, docs/ADR).

Task states are tracked in the root `TASKS.md` ledger.

## Decisions

- Shared `.agents/skills/` path over a Tabnine-specific copy (one file,
  one lockfile entry; drift-free).
- Delegation-dependent skills (`subagent-driven-change`,
  `implement-next`) excluded for Tabnine-only setups with an
  informational note.
- No Tabnine subagents while `"experimental": { "enableAgents": true }`
  gates them; APC never writes user settings.
- Strict guideline/skill layering; no content duplicated across layers.
