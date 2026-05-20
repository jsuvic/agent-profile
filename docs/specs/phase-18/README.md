# Phase 18 Spec Map

## Status

In progress. Spec 001 (`request-to-spec-issues` skill) is implemented; spec
002 (Tabnine planning guideline) remains Draft. Phase 18 is the post-grill
synthesis and planning-guidance slice that follows Phase 17's `grill-change`
skill.

Exact generated wording must be explicitly approved before implementation
because these artifacts steer planning, issue boundaries, and team workflow.
Phase 18 implementation is blocked by Phase 17 implementation, not only Phase
17 wording approval, because both phases update the same workflow-skill
fixtures, lockfiles, and owning target specs.

## Purpose

Phase 18 adds:

- the generated `request-to-spec-issues` workflow skill for Codex and Claude
- the generated Tabnine planning guideline that expresses the same workflow in
  Tabnine's guideline surface

## Review Order

1. `001-request-to-spec-issues-skill.md`
2. `002-tabnine-planning-guideline.md`

Implementation must follow this order or land both specs in one coordinated
change. Do not assign `001` and `002` to independent workers that both rewrite
the same generated fixtures and lockfiles in parallel.

## Dependencies

- Phase 17 `grill-change` implementation
- `docs/specs/phase-later/020-post-grill-planning-workflow.md`
- Existing Codex workflow skill target from `phase-03/004`
- Existing Claude workflow skill target from `phase-03/005`
- Existing Tabnine guidelines target from `phase-02/001`
- Existing golden fixture and lockfile contracts

## Implementation Gate

- Phase 17 generated wording is approved and implemented.
- The exact Phase 18 generated wording is approved.
- The additive fixture and lockfile blast radius is accepted.
- The `workflow.sdd` generation gate is accepted as the Phase 18 no-schema
  choice.

## Cumulative Footprint

For a project with Codex, Claude, Tabnine, and SDD enabled, Phases 17 and 18
add five generated planning artifacts:

- `.agents/skills/grill-change/SKILL.md`
- `.claude/skills/grill-change/SKILL.md`
- `.agents/skills/request-to-spec-issues/SKILL.md`
- `.claude/skills/request-to-spec-issues/SKILL.md`
- `.tabnine/guidelines/05-planning-workflow.md`

Phase 18 regression baselines are post-Phase-17 outputs. The `grill-change`
files count as existing generated workflow skill files when Phase 18 tests
assert byte-identical preservation.

## Out of Scope for Phase 18

- creating GitHub issues
- planning backend schema
- bundled skill references or scripts
- architecture rescue as a standalone generated skill
- autonomy modes or `bypassPermissions`
- Tabnine custom subagents
