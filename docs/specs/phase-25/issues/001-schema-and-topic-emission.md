# I1: Schema key + guidance topic emission

## Parent spec or request

`docs/specs/phase-25/001-logging-guidance.md`

## Intent summary

Flag on -> an always-read logging convention exists in every enabled client
surface (L1, L2).

## Behavior slice

`workflow.loggingGuidance` boolean added to the schema with validation. The
guidance topic content (six binding elements, the verbatim redaction rule,
the explicit priority order redaction > convention > codes) rendered as an
AGENTS.md section (inherited by CLAUDE.md) and a Tabnine guideline via the
existing guidance-topic renderers.

## Non-goals

- Enforcement lines (I2).
- Wizard checkbox (I3).

## Acceptance criteria

Spec acceptance criteria 1, 2, 5 (schema part), 6.

## Expected RED proof

A golden assertion for the flag-on AGENTS.md section fails against current
output; a schema unit test for the new key fails.

## Expected GREEN proof

Both pass; the flag-off byte-identity test passes; the verbatim-rule
assertion passes in every rendering.

## Seam under test

`compile(profile) -> emitted artifacts` via golden fixtures; schema
validation pure functions.

## Allowed mock boundary

None.

## Test command guidance

Compiler workspace tests via `npm run test`, then the golden suite.

## Likely file ownership

- `packages/compiler/src/guidance-content.ts`
- Schema module and its tests
- Golden fixtures

## Dependencies

None - `ready`.

## Parallelism notes

Content-file overlap with I2 - merge I1 first.

## Contract impact

Additive schema key; the verbatim redaction rule becomes fixed text.

## Security impact

The verbatim-rule assertion is mandatory; no telemetry or transport wording
anywhere in the topic.

## Documentation impact

Phase-25 README.

## Implementation context

Mirror the phase-23 memory-guidance emission pattern, including the
verbatim-rule test approach.

## Review expectations

All six content elements checked against L2 verbatim; the priority order
present; flag-off baseline byte-identical.
