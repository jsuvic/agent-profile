# Phase 17 Spec Map

## Status

Implemented. Phase 17 is the first implementation slice of the post-grill
planning workflow approved in
`docs/specs/phase-later/020-post-grill-planning-workflow.md`. The exact
generated skill wording was explicitly approved before implementation
because trigger wording affects runtime behavior.

## Purpose

Phase 17 adds the generated `grill-change` workflow skill for Codex and Claude.
The skill clarifies stakeholder requests before specs, issues, or
implementation work begin.

## Review Order

1. `001-grill-change-skill.md`

## Dependencies

- `docs/specs/phase-later/020-post-grill-planning-workflow.md`
- Existing Codex workflow skill target from `phase-03/004`
- Existing Claude workflow skill target from `phase-03/005`
- Existing doctor skill hygiene checks from `phase-04/006`
- Existing golden fixture and lockfile contracts

## Implementation Gate

- The exact `grill-change` generated Markdown is approved.
- The additive fixture and lockfile blast radius is accepted.
- The `workflow.sdd` generation gate is accepted as the Phase 17 no-schema
  choice.

## Out of Scope for Phase 17

- `request-to-spec-issues`
- planning backend schema
- GitHub issue creation
- bundled skill references or scripts
- architecture rescue implementation
- autonomy modes or `bypassPermissions`
