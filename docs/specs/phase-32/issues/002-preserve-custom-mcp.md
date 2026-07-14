# I2: Preserve custom MCP configuration across compile and Doctor

## Parent spec or request

`docs/specs/phase-32/001-guided-repository-update.md`

## Intent summary

Let users keep valid root MCP configuration that Agent Profile Compiler cannot
yet represent, without Doctor failure, compile deletion, or synchronization
claims.

## Behavior slice

Compile planning consumes I1's ownership decision, preserves valid custom root
`.mcp.json` bytes, writes a deterministic manual-owned lock descriptor, and is
idempotent. Doctor suppresses generated-byte drift for that file and emits one
informational limitation finding.

## Non-goals

- Parsing or validating individual MCP server commands beyond required safe
  structural classification.
- Rewriting, merging, copying, launching, or installing MCP servers.
- Downgrading malformed/unsafe configuration errors.

## Acceptance criteria

- Phase-32 acceptance criteria 2-3.
- Dry-run and write plans preserve custom MCP bytes exactly.
- Lock migration is atomic and a second run produces no ownership churn.
- Doctor info states user ownership, unsupported management, no cross-client
  synchronization, and future explicit adoption.
- Existing malformed, unsafe-path, and exact generated-empty cases preserve
  their error/generated behavior.

## Expected RED proof

A repository fixture with valid custom root `.mcp.json` produces
`LINT-LOCK-007`, and compile plans the 23-byte generated empty file over it.

## Expected GREEN proof

The same fixture passes preservation and idempotence sentinels, Doctor emits
only the bounded info finding, and no custom bytes appear in output.

## Seam under test

Real compile dry-run/write plus Doctor invocation against a temporary
repository fixture.

## Allowed mock boundary

Temporary filesystem and injected streams only. Compiler, lockfile, Doctor,
hashing, and ownership modules remain real; MCP launch/network are failing
sentinels.

## Test command guidance

Run focused CLI compile/Doctor integration tests, compiler and Doctor suites,
goldens if affected, check, lint, verify:pack, and package dry-run.

## Likely file ownership

- Compile-plan/reconciliation consumption of ownership decisions
- Lockfile descriptor construction and validation
- Doctor lock/ownership evaluation and presentation
- CLI/Doctor integration fixtures

## Dependencies

`sequenced` after Phase 32 I1.

## Parallelism notes

Can proceed in parallel with I5 after I1; avoid concurrent edits to shared CLI
presentation/fixtures without coordination.

## Contract impact

Intentional Doctor severity and compile ownership change for one scoped valid
future-configuration case. Generated empty, malformed, and unrelated outputs
remain frozen.

## Security impact

No custom values in reports; no environment/credential reads, server launch,
network, installation, upload, or reserialization.

## Documentation impact

Doctor code reference, compile ownership guide, MCP limitations, changelog.

## Implementation context

Use the shared I1 decision at every boundary. Do not special-case hashes
separately in compile and Doctor.

## Review expectations

Require byte sentinels before/after write, second-run idempotence, exact issue
envelope assertions, and runtime sentinels for every forbidden MCP side effect.
