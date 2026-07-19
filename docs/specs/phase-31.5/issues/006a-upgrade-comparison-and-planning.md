# I6a: Upgrade command exact comparison and retain/adopt/customize planning

## Parent spec or request

`docs/specs/phase-31.5/issues/006-upgrade-and-lock-resolution.md` (I6). Split
out 2026-07-19: I6's own foundational primitive (ordinary compile reuses the
lock for Codex/Claude v3 resolutions) shipped and merged (#122); this item
carries forward I6's still-open upgrade-command acceptance criteria.

## Intent summary

Give the CLI `upgrade` command model-aware comparison and planning atop the
already-shipped compiler-level reuse primitive, so a user can see exactly how
a role/client's model resolution would change and choose how to proceed.

## Behavior slice

Upgrade reads the profile's portable preset intent plus the current lock's
per-role/per-client `modelPolicy` resolutions (model, effort, alternatives,
lifecycle, capability status, `catalogVersion`), computes what today's
bundled catalog would resolve fresh for each role/client via the existing
`buildModelPolicyTargetTable`, and where the two differ, presents an upgrade
table (old vs. new, with a stated reason) and offers: Retain (keep every
locked row, no changes), role-aware Adopt (accept every role's fresh
recommendation), quality-first and cost-conscious bulk strategies, and Custom
exact (per-role/per-client picks). Each path must produce a deterministic
plan before any write occurs.

## Non-goals

- The metadata-only package/registry check (I6b).
- Probe consent and its separation from update-check consent (I6c).
- Tabnine row reconciliation/adoption (I6d).
- Unowned/drifted-file refusal semantics and rollback (I6e) - reuse existing
  atomic write-plan machinery for the actual write, but do not re-verify its
  contracts here.
- Automatic package installation, remote catalog mutation, or forced
  migration (already a non-goal of parent I6).

## Acceptance criteria

- Upgrade tables show exact old/new models, effort, alternatives, lifecycle,
  capability status, and reason for each changed role/client.
- Retain, role-aware adopt, quality-first, cost-conscious, and custom exact
  paths produce deterministic plans.
- A mapping-v2 profile (no `preset`) is unaffected: upgrade continues to show
  only the existing capability-catalog table, no model-policy table.
- Declining the upgrade (or choosing Retain) writes nothing and leaves the
  lock's `modelPolicy` block byte-identical.

## Expected RED proof

`agent-profile upgrade` today only compares the capability catalog
(`upgrade.catalogVersion`); it has no code path that reads `modelPolicy` from
the lock, computes a fresh comparison, or renders an old/new model table.

## Expected GREEN proof

Focused CLI upgrade tests proving: a changed bundled catalog produces a
correct old/new table with the right reason per row; each of the five
planning paths (retain, role-aware adopt, quality-first, cost-conscious,
custom exact) yields the documented deterministic plan; a mapping-v2 profile
and an unchanged v3 profile both produce a no-op-shaped result.

## Seam under test

`profile + lock.modelPolicy + live catalog -> upgrade comparison table + plan`.

## Allowed mock boundary

Clock only, if a "changed since" note needs a timestamp. Do not mock catalog
resolution, comparison, or planning - use the real bundled catalogs and real
`buildModelPolicyTargetTable`/`resolveModelPolicyLockfile`.

## Test command guidance

Run focused `apps/cli` upgrade tests, then `packages/compiler` tests if the
comparison helper lives there, then the affected workspace suites and check.

## Likely file ownership

- CLI upgrade planner/editor/presentation (`apps/cli/src/upgrade*.ts`)
- A new comparison helper (core or compiler package - old lock row vs. fresh
  `buildModelPolicyTargetTable` row, keyed by role+client)
- Upgrade CLI tests and fixtures

## Dependencies

Base I6 (shipped reuse primitive), I2, I5.

## Parallelism notes

I6b, I6c, and I6d can proceed in parallel with this item once its comparison
helper's shape is stable, since they attach optional steps to the same
command rather than modifying this item's core comparison/planning logic.
I6e depends on this item's write path existing.

## Contract impact

Adds model-aware upgrade planning to the existing `upgrade` command.
Capability-catalog upgrade semantics (`upgrade.catalogVersion`) are unchanged
and remain a separate lockfile concern.

## Security impact

No network access, no auto-install, no raw provider output. Reuses existing
atomic write-plan guarantees for any actual write.

## Documentation impact

Upgrade lifecycle walkthrough, old/new comparison example, retain/adopt/
customize path descriptions.

## Implementation context

Reuse `buildModelPolicyTargetTable`/`resolveModelPolicyLockfile`
(`packages/compiler/src/model-policy-target-adapter.ts`) as the comparison's
source of truth rather than re-deriving catalog resolution independently -
this is the same seam the base I6 cycle centralized for generated-file
rendering and lockfile serialization; a third independent implementation
would risk exactly the "generated files vs. lock disagree" defect that cycle
fixed.

## Review expectations

Inspect no-silent-remap proof, exact comparison completeness (every row/
reason accounted for), determinism of each planning path, and mapping-v2/
unchanged-profile no-op behavior.
