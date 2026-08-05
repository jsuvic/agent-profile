# ADR 0028: CLI-Owned Review Snapshot Provenance

## Status

Accepted 2026-08-02.

## Context

The compiler package can validate closed snapshot and result shapes but owns no
Git or filesystem IO. Both `spec-conformance/v1` and `change-risk/v2` accepted
caller-authored snapshot identities; a structurally plausible value could be
mistaken for evidence that repository reads occurred.

The package direction is CLI -> compiler. Moving Git/process IO into compiler
would reverse ownership, while type brands, tokens, callbacks, or producer
labels would only restate an unverifiable caller claim.

## Decision

The compiler owns the versioned structural `ReviewSnapshotDescriptorV1`
contract. The CLI is the only supported producer and constructs it from real
local Git/filesystem reads through an explicit command.

The CLI publishes an immutable, repository-local, ignored, content-addressed
snapshot and issues a `ReviewSnapshotHandleV1`. Generated Spec and change-risk
workflows use CLI manifest/read/evidence commands against that handle. Compiler
validation proves structure only; provenance language applies exclusively to
the CLI construction path.

One complete virtual repository tree serves both axes. Review policies version
independently from the shared snapshot schema.

This is a local construction-path guarantee, not cryptographic attestation. An
actor controlling the CLI process/binary, repository and store coherently, or
local machine remains able to fabricate the path.

## Consequences

- Both axes share one provenance owner and cannot drift independently.
- Compiler stays deterministic and IO-free; CLI gains a new local command and
  ignored snapshot lifecycle.
- Active pre-amendment reviews must restart; old identities cannot be adopted.
- Paused reviews gain stable exact bytes at the cost of local disk usage.
- Hashes detect drift/corruption but do not prove origin against the local
  controller.

## Alternatives Rejected

- Separate per-axis builders: repeats the instance-versus-class defect and
  permits contract drift.
- Compiler-owned IO: reverses package ownership and pollutes deterministic
  compilation.
- Internal-only CLI library: generated instruction workflows cannot enforce
  the path today.
- Caller callbacks or attestation fields: the caller can fabricate them.
- OS-temporary-only storage: pause/resume can lose the exact reviewed bytes.
- Signing or hosted attestation: outside the local-first threat model and
  introduces secrets or remote dependencies.
