# ADR 0010: Catalog-Version Provenance Over Per-Pack Decline Memory

## Status

Accepted 2026-07-08 with phase-27/002 spec approval.

## Context

Upgrade must distinguish "pack X did not exist when this profile was
made" from "user saw pack X and declined it". Which capabilities are
enabled is already recorded by `ai-profile.yaml` itself; the lockfile
only needs to record what has been offered.

## Decision

The lockfile gains one additive field, `upgrade.catalogVersion`, stamped
by init and by each upgrade write. APC ships a reviewed static capability
catalog (capability id -> version introduced -> insertion shape) in
`@agent-profile/core`. The offered set is: catalog entries newer than the
recorded version and not enabled in the profile. A missing field (all
pre-existing lockfiles) means "offer everything not enabled". No
per-capability offer/decline states are recorded.

## Rationale

One field plus a reviewed table covers the actual need ("what's new since
my profile was made"). Its worst failure - re-offering a declined pack
after the next catalog bump - is a mild annoyance behind a keep-current
default, not a correctness bug. Per-pack decline states would grow the
lockfile schema, add states doctor must validate and reconciliation must
reason about, and buy decline-memory nobody has asked for. The single
field migrates forward into per-pack states losslessly if ever needed;
the reverse migration loses information.

## Consequences

Positive:

- Minimal schema surface; deterministic, testable offered-set
  computation.
- The catalog doubles as the release-checklist record of when each
  capability appeared.

Negative:

- Declines are forgotten across catalog bumps.
- Every capability-adding phase must extend the catalog (enforced as a
  release-checklist item).
