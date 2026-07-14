# I2: Capability-graded client mapping and shared generation

## Parent spec or request

`docs/specs/phase-31/001-permission-posture-lifecycle.md`

## Intent summary

Translate the canonical posture plan into only officially verified shared
client configuration while reporting exact, manual, unsupported, blocked, and
unknown mapping states honestly.

## Behavior slice

Compilation of an explicitly adopted posture emits deterministic Claude/Codex
shared artifacts where supported and capability-accurate Tabnine guidance. It
also returns a versioned mapping report used by configure and doctor.

## Non-goals

- Personal/local activation writes.
- Reading effective client state.
- CLI orchestration.

## Acceptance criteria

- Phase-31 acceptance criteria 5-7 and 14.
- Every emitted client key has a dated official source and mapping version.
- Shared Trusted-local output removes contradictory routine approval gates but
  preserves hard denials.
- No undocumented Tabnine native-tool setting is generated.

## Expected RED proof

Trusted-local target fixtures either render current restrictive bytes or have
no mapping report; Codex/Tabnine limitation rows are absent.

## Expected GREEN proof

Mapping tables and exact target goldens pass for every posture/support grade;
all pre-adoption and legacy goldens remain byte-identical.

## Seam under test

`compile(PermissionPosturePlan) -> shared artifacts + ClientMappingReport`.

## Allowed mock boundary

None. Mapping catalog and generation are deterministic data/functions.

## Test command guidance

Run focused compiler mapping tests and target goldens, then full compiler,
doctor compatibility, check, lint, verify:pack, and package dry-run.

## Likely file ownership

- Compiler client mapping catalog and target renderers
- Claude/Codex/Tabnine target specs and dated research
- Golden fixtures and lockfile/template provenance

## Dependencies

`sequenced` after I1.

## Parallelism notes

Parallel-safe with I3 after I1. Serialize shared canonical type and golden
changes.

## Contract impact

Existing bytes stay frozen until explicit posture adoption. Enabled outputs
gain versioned capability-grade metadata through existing report/IR seams, not
new undocumented files.

## Security impact

No client invocation, network, secret access, global write, or unsafe generated
grant. Hard denials remain in every target mapping.

## Documentation impact

Target mapping docs, capability matrix, source URLs/dates, generated behavior
examples.

## Implementation context

Reverify Claude permission merge/precedence, Codex sandbox/approval/profile
scopes, and Tabnine IDE/CLI tool controls immediately before implementation.
Treat changed or missing documentation as a spec/golden update gate.

## Review expectations

Review exact bytes, support grades, mapping version, source evidence, legacy
goldens, and claims for unsupported/manual clients.
