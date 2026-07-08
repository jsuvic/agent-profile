# I2: Capability catalog and catalog-version provenance

## Parent spec or request

`docs/specs/phase-27/002-upgrade-flow.md`

## Intent summary

Represent upgradeable capabilities in one reviewed core catalog and derive the
offered set from profile intent plus the last catalog version recorded in the
lockfile.

## Behavior slice

Add a static capability catalog in `@agent-profile/core` mapping each capability
id to its introduced catalog version and insertion shape. Add the optional
`upgrade.catalogVersion` field to lockfile v2 without invalidating existing
lockfiles. Provide a pure offered-set computation that returns catalog entries
newer than the recorded version and not already enabled, treating a missing
version as "offer every capability not enabled."

## Non-goals

- The `upgrade` CLI command, prompts, profile editor, or init pointer (I3).
- Mutating `ai-profile.yaml` or stamping a lockfile from an upgrade flow.
- Per-capability decline memory or a lockfile version bump.
- Drift reconciliation and the no-args dispatcher (phase-27/003-004).

## Acceptance criteria

- Spec acceptance criteria 1 and 2 at the pure computation and lockfile-contract
  seams; write-time stamping remains I3.
- Catalog entries have unique ids, valid insertion shapes, and monotonically
  ordered introduced versions.
- Lockfile v2 with or without `upgrade.catalogVersion` validates, serializes
  deterministically, and preserves the field through v2 views.
- Offered-set tests cover catalogVersion present/missing x enabled/not-enabled,
  including an already-current profile.

## Expected RED proof

Catalog contract tests, the offered-set matrix, and lockfile validation tests
for `upgrade.catalogVersion` fail because neither the catalog nor provenance
field exists.

## Expected GREEN proof

The catalog contract and offered-set matrix pass; old lockfile fixtures remain
valid and byte-identical; a lockfile containing the additive provenance field
round-trips deterministically.

## Seam under test

Computation: `computeOfferedCapabilities(profile, catalogVersion) -> catalog
entries`, treated as a pure black box. Lockfile contract:
`validateLockfileText(serializeLockfile(lockfile)) -> validated v2 lockfile`.

## Allowed mock boundary

None. Use value fixtures only; do not mock core or compiler code.

## Test command guidance

Run the focused core and compiler workspace tests, then the repository golden
suite and doctor/check command if available. Do not regenerate fixtures unless
the approved additive lockfile contract requires a new focused fixture.

## Likely file ownership

- `packages/core/src/capability-catalog.ts` and focused test
- `packages/core/src/index.ts` public exports
- `packages/compiler/src/lockfile.ts` and focused/phase-14 lockfile tests
- Any source lockfile type module discovered through the existing compiler seam

## Dependencies

Phase-27 I1 is done. This issue is `ready`.

## Parallelism notes

I3 is sequenced after this issue because it consumes both the catalog and the
provenance contract. Coordinate lockfile and CLI imports with phase-27 I4 if 003
is approved independently.

## Contract impact

Adds a reviewed `@agent-profile/core` catalog API and one optional lockfile-v2
field. Existing lockfiles remain valid; no profile-schema field changes.

## Security impact

Pure local computation only. No network, telemetry, dependency, source upload,
secret read, or permission-posture change.

## Documentation impact

Record the catalog bump rule in the release checklist when I3 completes the
user-facing flow. No command documentation is added in this slice.

## Implementation context

The existing lockfile construction, serialization, validation, migration, and
v2-view seams live in `packages/compiler/src/lockfile.ts`; current lockfile
contract tests include `packages/compiler/src/phase14.test.ts`. Core profile
capabilities already expose workflow booleans, skill packs, and subagent state;
the catalog must describe insertion shapes without changing those profile
types. Use the existing project version-comparison convention if one exists;
otherwise keep catalog-version comparison private and explicit rather than
adding a general semver abstraction.

## Review expectations

Require a table-driven mapping from every catalog entry to its enabled-state
detector and insertion shape; prove the missing-version seeding rule; verify
validation order and unknown-field behavior; confirm old lockfile fixtures and
goldens do not drift.
