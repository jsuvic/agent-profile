# Spec Amendment: CLI-Owned Review Snapshot Provenance

## Status

Approved 2026-08-02 from the completed CLI-owned review provenance grill.
Amends `001-change-risk-review-assurance.md` and
`issues/020-spec-conformance-reviewer.md`.

The approval authorizes specification, issue, glossary, ADR, and ledger
persistence only. It does not authorize implementation or unskipping the
preserved provenance RED tests.

## Problem

Both generated review axes accept structurally valid snapshot claims without
owning the IO that could make those claims trustworthy.

- `spec-conformance/v1` accepts caller-authored Git identifiers, diffs, paths,
  and evidence locators after validating their shape and internal consistency.
- `change-risk/v2` accepts a caller-minted `snapshotId` as both a valid clean
  result identity and a valid orchestration-state identity.
- The compiler package is pure and performs no repository IO, so no compiler
  predicate can establish that Git or filesystem reads occurred.

This is the same defect class as PR #148's derived-identity arc:
`validateReviewLearningRecordV1` checked fingerprint shape without checking
its derivation. The safe correction was to derive the value at the owner
boundary rather than accept a plausible value. Snapshot and evidence
provenance require the same correction one layer higher.

## Goal

Both Spec and change-risk review consume one CLI-produced, content-addressed
snapshot handle whose immutable repository view and evidence locators come
from real local Git and filesystem reads. Compiler validation remains
structural and is never described as provenance verification.

## Intent

Make the construction path, rather than the envelope's confidence, the source
of the local provenance guarantee. Fix the shared class once for both review
axes while preserving package dependency direction, local-first operation,
clean-room review, bounded context, and separate review results.

## Decision Rules

1. Provenance doubt -> identify the path that performed the IO; shape is not
   provenance.
2. Ownership doubt -> Git/filesystem reads belong to the CLI; structural
   contracts belong to the compiler.
3. Scope doubt -> fix `review-snapshot/v1` for both axes, not one validator.
4. Evidence doubt -> resolve the locator against the CLI snapshot handle.
5. Worktree-race doubt -> discard and rebuild once; never accept torn bytes.
6. Path doubt -> refuse ambiguity instead of normalizing it.
7. Completeness doubt -> return `NEEDS_CONTEXT`; never truncate or silently
   exclude.
8. Migration doubt -> reread the repository; never relabel an old identity.
9. Threat-model doubt -> call this a local construction-path guarantee, not
   cryptographic origin proof.
10. Version doubt -> evolve descriptor and review-policy versions
    independently.

## Non-Goals

- Compiler-owned Git or filesystem IO.
- A `Trusted*` type, brand, token, producer field, predicate, or attestation
  presented as proof.
- Protection from a process that controls the CLI, repository, snapshot
  store, CLI binary, or local machine.
- Signing keys, TPM binding, hosted attestation, remote services, or a custom
  sandbox.
- Remote fetches or an inferred `main`, `master`, or other fixed point.
- Staging, committing, or long-lived repository locking during construction.
- Symlink dereference or recursive submodule capture in v1.
- Migration or adoption of pre-amendment snapshot identities.
- Combining or reranking Spec and change-risk findings.
- Blocking the existing Phase 33 I6 slice on this amendment.

## User Flow

1. The generated workflow invokes
   `agent-profile review-snapshot build --fixed-point <ref>`.
2. The CLI discovers the repository root, resolves the explicit fixed point,
   HEAD, and merge base locally, and classifies committed, staged, unstaged,
   deleted, renamed, ignored, and untracked state.
3. The CLI builds a complete immutable virtual repository view in a temporary
   directory, verifies the repository did not change during construction, and
   atomically publishes a content-addressed snapshot.
4. The workflow receives a `ReviewSnapshotHandleV1`, then uses CLI `manifest`,
   `read`, and `evidence` commands to inspect it.
5. Spec and change-risk reviewers receive axis-specific projections referencing
   the same handle. Their results remain independent.
6. A paused workflow retains the snapshot. After terminal orchestration, an
   explicit cleanup command may remove it.
7. Any unavailable, incomplete, changed, oversized, unsupported, or corrupt
   snapshot produces a closed error and `NEEDS_CONTEXT`; there is no raw
   descriptor fallback.

## Inputs

- Explicit `--fixed-point <ref>` supplied by the workflow owner.
- Locally resolved repository root, HEAD, merge base, and Git object tree.
- Committed base-to-head change, index state, worktree state, and every
  non-ignored untracked path unless explicitly excluded with a reason.
- Repository ignore rules and canonical path rules.
- Requested snapshot handle, repository-relative path, and optional range for
  later access.

## Outputs

- Compiler-owned structural `ReviewSnapshotDescriptorV1` with schema version
  `review-snapshot/v1`.
- CLI-issued `ReviewSnapshotHandleV1` containing the snapshot identity and
  local store reference.
- An ignored content-addressed store under
  `.agent-profile/review-snapshots/<snapshotId>/`.
- Safe manifest metadata, bounded explicit reads, and snapshot-bound evidence
  locators.
- Closed command errors and non-zero exit codes on failure.
- `change-risk/v3` and `spec-conformance/v2` projections consuming the shared
  handle.

## Contracts

### Version and ownership contract

- `review-snapshot/v1`, `change-risk/v3`, and `spec-conformance/v2` are
  independently versioned.
- The compiler defines and validates descriptor, handle, manifest, and
  evidence-locator shapes. It does not construct them and does not verify
  provenance.
- The CLI is the only supported producer. Generated workflows authorize
  `CLEAN` or `COMPLIANT` only through CLI handle construction and resolution.
- A direct compiler caller can fabricate a structurally valid descriptor,
  identity, and evidence set. Compiler acceptance proves structure only and
  carries no supported provenance guarantee.

### Descriptor contract

`ReviewSnapshotDescriptorV1` carries at least:

- exact schema version and deterministic `snapshotId`
- requested fixed-point ref plus resolved fixed-point, HEAD, and merge-base
  commit IDs
- deterministic changed-file manifest with committed, staged, unstaged,
  deleted, renamed, and included/excluded-untracked classifications
- canonical repository-relative paths, sizes, media classes, and content
  hashes
- explicit exclusion path and concise reason
- Git-tree identity for unchanged tracked files
- overlay identities for exact noncommitted bytes
- symlink target text and gitlink commit identity where applicable
- closed store-format version and component hash table

The descriptor contains metadata and identities, not an eager full-source dump.

### Construction contract

- `build` requires an explicit locally resolvable commit fixed point. It never
  fetches, guesses, or falls back.
- Repository root discovery is local. Paths outside it are refused.
- Construction uses no staging, commit, or persistent repository lock.
- The CLI captures HEAD, index identity, status/classification, and relevant
  metadata before materialization; after materialization it re-reads those
  identities and verifies stored bytes.
- A changed observation discards the temporary bundle and permits one
  automatic rebuild. A second change returns
  `RSNAP_CHANGED_DURING_BUILD` and maps to `NEEDS_CONTEXT`.
- Publication is an atomic rename after successful verification.

### Immutable virtual-tree contract

- The snapshot represents the complete tracked HEAD tree plus exact overlays
  for staged, unstaged, deleted, renamed, and included-untracked state.
- An unchanged tracked consumer resolves through the same handle without
  changing the snapshot ID.
- The changed-file manifest is the review index, not the extent of the
  immutable tree.
- Later reads never silently fall through to current worktree bytes.

### Store and lifecycle contract

- `.agent-profile/review-snapshots/` is committed to `.gitignore` and is never
  generated-owned or added to the profile lockfile.
- Temporary directories remain beside the final store so atomic rename stays
  on one filesystem. Failed builds remove their temporary content.
- The store is retained across pause/resume. Cleanup is explicit and only
  permitted after terminal orchestration or human abandonment.
- Normal output prints only safe metadata. Raw content appears only through an
  explicit bounded `read`.

### Access and evidence contract

- `manifest --handle` returns canonical paths, classifications, sizes, hashes,
  fixed-point/HEAD/merge-base IDs, and exclusions with reasons.
- `read --handle --path [--lines]` canonicalizes the requested path, verifies
  the stored hash, and returns only the requested bytes or text range.
- `evidence --handle --path [...]` returns a locator bound to `snapshotId`,
  canonical path, content hash, media class, and valid range when textual.
- Spec coverage/findings and change-risk evidence must resolve through these
  locators. A caller-authored path and summary alone are never provenance.
- Unknown, excluded, nonexistent, aliased, or out-of-range locations fail.

### Repository-entry contract

- Symlinks are captured as link objects and target text and are never
  dereferenced. An in-repository target is inspected separately.
- Gitlinks capture the submodule commit identity only. Review needing
  submodule internals returns `NEEDS_CONTEXT`.
- Binary content is byte/hash addressable and rejects line ranges.
- Traversal, absolute paths, device paths, alternate separators, dot aliases,
  doubled separators, case-colliding paths, and repository-escaping links are
  refused.
- Oversized files, overlays, manifests, or stores fail rather than truncate.

### Closed limits

The shared policy source owns these v1 ceilings:

- 4,096 changed-manifest entries
- 1,024 included or explicitly excluded untracked paths
- 4,096 UTF-16 code units per repository-relative path or exclusion reason
- 32 MiB per materialized noncommitted file
- 64 MiB aggregate materialized noncommitted bytes
- 1 MiB maximum single text-range response
- 32 MiB maximum explicit binary read

Bounds are checked before traversal, decoding, payload construction, hashing,
or output. A later limit change advances `review-snapshot`'s version when it
changes accepted content.

### Error and exit contract

Closed error codes are:

- `RSNAP_INVALID_FIXED_POINT`
- `RSNAP_UNRELATED_FIXED_POINT`
- `RSNAP_CHANGED_DURING_BUILD`
- `RSNAP_INVALID_PATH`
- `RSNAP_UNSUPPORTED_ENTRY`
- `RSNAP_TOO_LARGE`
- `RSNAP_HANDLE_NOT_FOUND`
- `RSNAP_HASH_MISMATCH`
- `RSNAP_INVALID_RANGE`
- `RSNAP_STORE_WRITE_FAILED`

Exit `0` means success; `2` means invalid invocation/ref/path/range; `3` means
required local context is unavailable, unsupported, changed, or too large;
`4` means snapshot integrity failure; unexpected internal failure uses `1`.
Generated workflows map every non-zero construction/access outcome to
`NEEDS_CONTEXT` with the code and redacted safe metadata. They never convert
failure to clean.

### Migration contract

- Historical `review-learning/v1` records remain unchanged with their original
  source policy.
- Active `change-risk/v2` state cannot resume as v3; it rebuilds and restarts
  with fresh counters.
- `spec-conformance/v1` cannot satisfy the v2 gate.
- No producer label, version rewrite, adoption, or descriptor wrapper upgrades
  an old identity. Missing historical refs or bytes return `NEEDS_CONTEXT`.

## Security Rules

- Local-only: no source upload, hosted execution, telemetry, or network access.
- Never read secrets deliberately or print environment values, raw transcripts,
  or the complete snapshot bundle.
- Snapshot paths never escape the repository or store root.
- Hashes detect drift and incoherent corruption; they are not signatures.
- The guarantee excludes an actor controlling the CLI process/binary, the
  repository and store coherently, or the local machine.
- No secret token, signing key, TPM, permission bypass, automatic dependency
  installation, staging mutation, or repository lock is introduced.

## Acceptance Criteria

1. One compiler-owned `review-snapshot/v1` structural contract serves both
   review axes while CLI owns all construction IO.
2. A CLI build over a real temporary Git repository produces a deterministic
   handle for identical bytes and a different handle for any committed,
   staged, unstaged, deletion, rename, or included-untracked byte change.
3. Real-repository tests cover invalid/unrelated refs, ignored and untracked
   classification, one successful concurrent-change rebuild, and second-change
   refusal without staging or locking.
4. Manifest/read/evidence commands resolve changed and unchanged consumers,
   reject every unsafe path class, verify hashes, and bind textual/binary
   evidence to the handle.
5. Table-driven tests cover symlink non-dereference, gitlink behavior, binary
   ranges, case collisions, closed limits, every error code, and exit mapping.
6. `spec-conformance/v2` rejects raw descriptors and v1 results; the three
   skipped provenance RED tests become GREEN through the CLI handle path.
7. `change-risk/v3` rejects caller-minted IDs and v2 resume; clean/results and
   orchestration state validate only against a CLI handle.
8. Spec and change-risk findings remain separate and neither receives the
   other's results or priorities.
9. Generated Codex/Claude workflows require the CLI path and have no raw
   descriptor fallback.
10. Packed CLI/compiler artifacts, self-applied generated bytes, golden
    fixtures, `npm run check`, doctor where applicable, and pack verification
    exit zero.

## Tests

- Pure compiler tests for closed descriptor/handle/locator schemas, limits,
  versions, and structural-only terminology.
- CLI integration tests using real temporary Git repositories and filesystem
  bytes; Git, owned filesystem logic, and the CLI command itself are not mocked.
- Table-driven path, entry-kind, error-code, migration, and evidence-range
  tests.
- Generated Codex/Claude workflow golden tests, including forbidden raw
  fallback language and absent Standards-axis content.
- Published-package tests invoking the packed CLI against a temporary repo.
- Runtime sentinels proving no network, staging, commit, symlink dereference,
  outside-root read, or whole-bundle stdout path occurs.

## TDD Strategy

- I21 RED: the real CLI has no `review-snapshot build` and cannot produce a
  deterministic immutable handle.
- I22 RED: a produced handle cannot safely manifest/read/bind unchanged
  consumer evidence or enforce lifecycle/path contracts.
- I20 resumed RED: the three preserved skipped attacks still pass through the
  Spec gate; unskip them before the production fix.
- I23 RED: change-risk accepts `caller-minted-snapshot` and v2 state can appear
  resumable without rebuilding.
- I24 RED: the packed CLI/workflows cannot complete both axes through one
  snapshot handle.

Each slice uses one highest practical observable boundary. Real temp Git repos
replace Git/process mocks; deterministic compiler generation uses golden
fixtures.

## Issue Plan

Architecture rescue is prerequisite: the current compiler policies accept
caller assertions while no CLI review-snapshot owner exists. I21 establishes
the deeper shared descriptor/builder boundary before either axis integrates.

- I21: build and atomically persist `review-snapshot/v1` through the real CLI.
- I22: safely manifest, read, bind evidence, retain, and clean up a handle.
- I20 resume: advance Spec to v2 and consume I22; unskip and close the three
  preserved provenance attacks.
- I23: advance change-risk to v3 and consume I22, including non-migration.
- I24: validate both axes and the packaged workflow end to end.

## Documentation Updates

- CLI command reference and local snapshot-store lifecycle.
- Phase 33 README/spec index and version table.
- Review workflow documentation distinguishing structural validation from the
  CLI construction-path guarantee.
- Security/threat-model documentation naming the residual local-controller
  capability.
- Migration note for active v2/v1 reviews.

## Final Review Checklist

- Build a spec-to-test matrix for every MUST, acceptance criterion, error code,
  limit, and migration refusal.
- Prove all three preserved attack shapes through real CLI construction.
- Verify the same class is closed for change-risk, not only Spec.
- Confirm compiler contains no Git/filesystem IO or `Trusted*`/attestation
  claim.
- Confirm CLI never uploads, fetches, stages, commits, locks, dereferences
  symlinks, reads outside root, truncates, or dumps the bundle.
- Confirm generated artifacts come from source and I14 passes committed bytes
  and path sets.
- Confirm Spec/code-quality/change-risk results remain separate.
- Run focused tests, goldens, published-package proof, `npm run check`, doctor
  where applicable, and pack verification by exit code.
