# I22: Resolve snapshot manifests, reads, evidence, and lifecycle

## Parent spec or request

`docs/specs/phase-33/004-cli-owned-review-provenance-amendment.md`

## Intent summary

Keep the construction-path guarantee intact after build by making CLI handle
resolution the only supported provenance-bearing access path.

## Behavior slice

Given an I21 handle, CLI `manifest`, `read`, `evidence`, and cleanup operations
resolve the immutable virtual tree, verify component hashes, enforce canonical
paths and entry semantics, and bind changed or unchanged consumer evidence to
the exact snapshot ID. Paused workflows retain snapshots; terminal or
human-abandoned workflows can explicitly clean them up.

## Non-goals

- Building snapshots; I21 owns construction.
- Spec/change-risk policy integration.
- Direct trusted access to store files.
- Symlink dereference, submodule recursion, implicit whole-bundle output, or
  automatic cleanup while an active state can resume.

## Acceptance criteria

- `manifest --handle` returns only Amendment 004's safe deterministic metadata.
- `read` resolves changed and unchanged tracked paths through the virtual tree,
  verifies hashes before output, and bounds explicit text/binary responses.
- `evidence` emits snapshot-bound canonical locators with content hash, media
  class, and valid textual range when applicable.
- Table tests reject missing/corrupt handles, path aliases/escapes/collisions,
  nonexistent or excluded paths, hash mismatch, binary line ranges, invalid
  text ranges, unsupported gitlinks, and closed size limits.
- Symlinks return link metadata without dereference; gitlinks return commit
  identity and `NEEDS_CONTEXT` for internals.
- Direct worktree mutation after build cannot change a handle read.
- Cleanup refuses active snapshots, succeeds for terminal/abandoned snapshots,
  is idempotent, and never deletes outside the ignored store.
- Every access/lifecycle error code and exit status is exact and redacted.

## Expected RED proof

An I21 handle cannot resolve an unchanged consumer or produce a validated
evidence locator because access commands do not exist.

## Expected GREEN proof

The real CLI resolves changed and unchanged content from the immutable handle,
binds evidence, detects corruption, and safely cleans a terminal snapshot.

## Seam under test

Orchestration seam: CLI handle command -> verified bounded output or closed
error against a real I21 snapshot store.

## Allowed mock boundary

None. Use real temporary stores and Git repositories. Do not mock path, hash,
filesystem, manifest, evidence, or cleanup behavior.

## Test command guidance

Run focused CLI access/lifecycle integration tests, compiler locator-contract
tests, then CLI/compiler checks and pack verification.

## Likely file ownership

- I21 CLI review-snapshot module and compiler contract module
- CLI dispatch/help and focused integration tests
- Pack fixtures and command documentation

## Dependencies

Sequenced after I21.

## Parallelism notes

Not parallel-safe with I21. After I22 lands, I20 and I23 are parallel-safe
apart from shared generated workflow fixtures.

## Contract impact

Completes `ReviewSnapshotHandleV1` access and evidence semantics and local
store lifecycle. No review policy version changes in this slice.

## Security impact

All reads are local, canonical, bounded, hash-checked, and rooted. Cleanup is
restricted to resolved store children. Direct store access remains explicitly
outside the supported guarantee.

## Documentation impact

Document manifest/read/evidence/cleanup commands, binary/link/gitlink behavior,
retention, corruption handling, and explicit raw-read semantics.

## Implementation context

The immutable tree is HEAD's Git tree plus I21 overlays. Do not rebuild the
tree from the live worktree during access.

## Review expectations

Inspect every path-bearing call site as one class. Confirm the same locator
contract serves both axes and no convenience API bypasses handle resolution.
