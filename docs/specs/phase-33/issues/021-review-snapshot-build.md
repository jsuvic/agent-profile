# I21: Build the CLI-owned immutable review snapshot

## Parent spec or request

`docs/specs/phase-33/004-cli-owned-review-provenance-amendment.md`

## Intent summary

Establish the architecture-rescue seam: the compiler owns the closed
`review-snapshot/v1` structure while the real CLI constructs and atomically
persists it from local Git and filesystem reads.

## Behavior slice

`agent-profile review-snapshot build --fixed-point <ref>` runs in a real
repository, resolves the explicit comparison commits locally, captures a
complete immutable virtual tree plus changed manifest, double-checks the
observation, and atomically publishes a content-addressed bundle and handle.

The slice includes the structural compiler contract because the CLI must emit
one closed value, but all IO remains CLI-owned. The build performs one bounded
retry when the repository changes during construction and otherwise returns a
closed error without leaving a published partial store.

## Non-goals

- Manifest/read/evidence/cleanup commands; I22 owns access and lifecycle.
- Spec or change-risk integration.
- Compiler-owned Git/filesystem IO.
- Remote fetch, implicit fixed points, staging, commit, repository lock,
  symlink dereference, or submodule recursion.

## Acceptance criteria

- The compiler exports structurally closed descriptor/handle/component types
  and validators for `review-snapshot/v1` without `Trusted*`, attestation, or
  provenance-verification claims.
- The CLI build command requires an explicit fixed point and resolves fixed
  point, HEAD, and merge base locally.
- Identical repository bytes produce the same snapshot ID; changes to any
  committed, staged, unstaged, deletion, rename, or included-untracked byte
  change it.
- The changed manifest, exclusions, Git-tree identity, overlays, symlink
  targets, gitlinks, media classes, sizes, and hashes satisfy Amendment 004.
- The store is written under the ignored repository-local path through a temp
  sibling and atomic rename; failure publishes nothing.
- A real concurrent mutation causes one rebuild; a second returns
  `RSNAP_CHANGED_DURING_BUILD`.
- Every build/path/entry/size/store error and exit code owned by this command is
  table-tested and redacted.
- Runtime sentinels prove no network, staging, commit, persistent lock,
  symlink dereference, outside-root read, or full-bundle stdout.

## Expected RED proof

Invoking `agent-profile review-snapshot build --fixed-point <valid-ref>` in a
temporary real Git repository fails because the command and shared descriptor
contract do not exist.

## Expected GREEN proof

The same invocation exits zero, emits only safe handle metadata, and leaves a
validated atomic content-addressed snapshot whose identity changes for every
covered byte class.

## Seam under test

Orchestration seam: CLI invocation in a real temporary Git repository ->
observable exit code, safe stdout/stderr, and published snapshot directory.

## Allowed mock boundary

Clock only when deterministic timestamps cannot be omitted. Do not mock Git,
the filesystem, the CLI command, hashing, or compiler validators; use real
temporary repositories and directories.

## Test command guidance

Run focused compiler contract tests and focused CLI build integration tests,
then CLI/compiler checks and package metadata verification.

## Likely file ownership

- New shared snapshot-contract module under `packages/compiler/src/`
- New CLI review-snapshot owner under `apps/cli/src/`
- CLI command dispatch/help and focused compiler/CLI tests
- `.gitignore`
- Compiler/CLI package exports and pack fixtures

## Dependencies

`ready` after approved G4/Amendment 004.

## Parallelism notes

Prerequisite architecture rescue. Not parallel-safe with other CLI dispatcher,
compiler export, or package-fixture changes.

## Contract impact

Adds `review-snapshot/v1`, `ReviewSnapshotDescriptorV1`,
`ReviewSnapshotHandleV1`, a CLI command, closed limits/errors, and an ignored
local store. No review policy advances in this slice.

## Security impact

Local-only repository reads and writes to one ignored store. The command must
never escape root, upload, fetch, stage, commit, lock, dereference links, or
print the bundle.

## Documentation impact

Document build syntax, explicit fixed-point requirement, store location,
structural-only compiler validation, and residual local-controller threat.

## Implementation context

Reuse canonical safe-path, hashing, Git execution, atomic-write, and repository
root seams. Do not import CLI from compiler or reimplement an exported helper.

## Review expectations

Challenge every IO ownership claim and prove it with runtime sentinels. Treat
a producer field, callback, token, brand, or raw descriptor fallback as a P1.
