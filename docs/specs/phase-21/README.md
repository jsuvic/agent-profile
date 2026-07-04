# Phase 21 Spec Map

## Status

Approved on 2026-07-04.

Phase 21 is the WS5 advisory slice of the Agent Capability Direction
(`docs/plans/003-ws3-ws7-spec-synthesis.md`): a neutral `capabilities.hooks`
intent and non-executing advisory hooks (final-review reminder, git context
injection, pre-compact checkpoint) for Claude/Codex, off by default,
project-local, validated by doctor without execution.

Command-runner hooks (WS5-S2) are explicitly not in this phase; they remain
the `phase-later/001-hooks-targets.md` draft behind a threat-model human gate.

## Review Order

1. `001-advisory-hooks.md`

## Dependencies

- Phase 12 `001` capability matrix (Codex hook-support verification gates
  Codex emission) and `007` init wizard (the hooks checkbox).
- Phase 5 diff-before-write; Phase 4 doctor issue envelope; lockfile
  determinism contracts.
- `phase-later/001-hooks-targets.md` event taxonomy (re-verified at
  implementation time) and `LINT-HOOK-*` code namespace.

## Out of Scope for Phase 21

- Any hook that runs a project binary, writes, installs, or uses the network.
- Global/user-level hooks; Tabnine hooks.
- Executing hooks at compile/validation/doctor time.
