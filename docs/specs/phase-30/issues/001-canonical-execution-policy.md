# I1: Canonical execution policy and client rendering

## Parent spec or request

`docs/specs/phase-30/001-role-aware-indexed-subagents.md`

## Intent summary

Create the opt-in canonical contract for role-aware capability/effort,
orchestration, context, and evidence preferences, then render only verified
client capabilities.

## Behavior slice

An enabled `subagentPolicy` parses into immutable canonical IR and emits
deterministic Codex/Claude guidance or configuration. Tabnine receives only
portable conventions. Omitted/disabled policy preserves prior bytes.

## Non-goals

- Running subagents or building task capsules.
- Probing or repairing CCE.
- Writing evidence traces.

## Acceptance criteria

Phase-30 acceptance criteria 1-4, limited to schema, mappings, rendering, and
disabled-policy compatibility.

## Expected RED proof

Schema fixtures reject `subagentPolicy` as unknown and enabled target goldens
lack role/mapping output.

## Expected GREEN proof

Parser/mapping tests and target goldens pass; disabled-profile fixtures remain
byte-identical.

## Seam under test

`compile(profile) -> canonical IR and emitted target artifacts`.

## Allowed mock boundary

None; mappings and compilation are deterministic pure inputs.

## Test command guidance

Run focused schema/compiler tests first, then goldens, full tests, check, and
pack verification.

## Likely file ownership

- Core schema/types and validation errors
- Compiler IR, capability mappings, selection/guidance content
- Target goldens, schema docs, capability research, lockfile provenance

## Dependencies

None; first ready Phase-30 slice.

## Parallelism notes

Owns shared schema and canonical guidance. Finish before I2/I3; serialize any
golden overlap.

## Contract impact

Additive schema and deterministic outputs only when explicitly enabled. Freeze
role keys, default matrix, validation codes, override syntax, and mapping
version in RED tests.

## Security impact

Reject unsafe evidence/orchestration values; do not invoke clients, tools, or
network during compilation.

## Documentation impact

Schema reference, example profile, capability matrix, and generated guidance.

## Implementation context

Verify current Codex and Claude model/effort controls from official sources at
implementation time. Unsupported effort must use a documented deterministic
mapping, never an invented target value.

## Review expectations

Inspect exact disabled-output bytes, all invalid rows, mapping evidence dates,
Tabnine capability accuracy, deep immutability, and lockfile provenance.
