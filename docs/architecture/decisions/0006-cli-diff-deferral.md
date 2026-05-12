# ADR 0006: CLI Diff Deferral

## Status

Accepted for Phase 5 closure

## Context

Phase 5 introduces the first write-capable CLI flows: `compile`, `init`,
`init --import`, the internal diff-before-write helper, local stack detection,
and import analysis.

A standalone `agent-profile diff` command is useful, but it has a different
contract from the internal write-plan helper. It needs its own output shape,
exit-code policy, JSON envelope, and drift-vs-diff semantics. Adding
`doctor --diff` would also change the stable doctor JSON contract and requires
a separate spec amendment.

## Decision

Defer standalone `agent-profile diff` from Phase 5.

Phase 5 remains limited to:

- `agent-profile doctor`
- `agent-profile compile`
- `agent-profile init`
- `agent-profile init --import`
- diff-before-write as an internal write-safety helper

The deferred diff command is tracked as
`docs/specs/phase-later/004-cli-diff-command.md`.

`doctor --diff` is not part of Phase 5. If added later, it must amend the
doctor command spec and document the JSON output changes before implementation.

## Rationale

`agent-profile compile --dry-run` and `agent-profile doctor` cover the Phase 5
review and safety use cases without introducing another command surface. A
standalone diff command should be shaped by real compile/init usage after Phase
5, not guessed before the write flows are stable.

## Consequences

Positive:

- Phase 5 can close around verified compile/init behavior.
- The stable doctor JSON contract is preserved.
- Diff UX, exit codes, and JSON shape can be designed deliberately later.

Negative:

- Users do not get a dedicated diff command in Phase 5.
- Detailed hunk-style review remains outside the MVP command set for now.

## Revisit Triggers

Revisit after Phase 6 user feedback if:

- `compile --dry-run` reports are not sufficient for review.
- users need CI-friendly diff JSON separate from doctor output.
- doctor needs a diff mode and its JSON contract can be versioned safely.
