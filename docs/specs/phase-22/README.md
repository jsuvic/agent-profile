# Phase 22 Spec Map

## Status

Approved on 2026-07-04.

Phase 22 is the WS6 slice of the Agent Capability Direction
(`docs/plans/003-ws3-ws7-spec-synthesis.md`): instruction-only loop skills
that finally give content to the `automation` pack reserved by
`phase-12/002`. APC emits bounded, gated iteration instructions for
Claude/Codex and never executes, launches, or iterates anything itself.

## Review Order

1. `001-automation-loop-skills.md`

## Dependencies

- Phase 12 `002` (pack schema + mapping table; the `automation` reservation
  this phase discharges), `003` (conditional-pointer rule), `006`
  (dangling-reference doctor check), `007` (wizard pack selection).
- Lockfile determinism and golden fixture contracts.

## Out of Scope for Phase 22

- Any APC-executed loop, background mode, or autonomous iteration.
- Hook-triggered or scheduled loops.
- Tabnine loop guidelines.
