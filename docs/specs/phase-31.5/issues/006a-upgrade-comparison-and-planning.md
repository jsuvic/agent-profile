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

Upgrade reads the profile's portable preset intent plus its current locked
resolution, computes what today's bundled catalog would resolve fresh for
each role/client, and where the two differ, presents an upgrade table (old
vs. new, with a stated reason) and offers: Retain (keep every locked row, no
changes), role-aware Adopt (accept every role's fresh recommendation),
quality-first and cost-conscious bulk strategies, and Custom exact
(per-role/per-client picks). Each path must produce a deterministic plan
before any write occurs.

Per the parent spec's "Existing repository upgrade" flow (step 1: `agent-profile
upgrade` compares "the legacy/locked catalog resolution with mapping v3"),
this applies to BOTH a v3-opted profile (comparing its lock's `modelPolicy`
rows, model/effort/alternatives/lifecycle/capability status/`catalogVersion`,
via `buildModelPolicyTargetTable`/`resolveModelPolicyLockfile`) AND an
enabled mapping-v2 profile with no `preset` (comparing its Phase 30 legacy
resolver output, `resolveRoleMapping`, against what a v3 preset would
resolve instead). A mapping-v2 profile must not be excluded from the
comparison table or the retain/adopt/customize paths - it is offered the
identical choice set, just starting from a legacy rather than v3 locked
baseline. What stays true only for *ordinary compile* (not `upgrade`,
already covered by base I6) is that a mapping-v2 profile's generated output
and lockfile are unaffected until an upgrade is explicitly accepted.

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
  capability status, and reason for each changed role/client, for both a
  v3-opted profile and an enabled mapping-v2 profile (comparing its legacy
  resolution against v3, per the parent spec's "Existing repository upgrade"
  flow).
- Retain, role-aware adopt, quality-first, cost-conscious, and custom exact
  paths produce deterministic plans, for both a v3-opted profile and a
  mapping-v2 profile choosing to adopt v3.
- Declining the upgrade (or choosing Retain) writes nothing: a v3-opted
  profile's lock `modelPolicy` block stays byte-identical, and a mapping-v2
  profile stays on legacy resolution with no `modelPolicy` block written.

## Expected RED proof

`agent-profile upgrade` today only compares the capability catalog
(`upgrade.catalogVersion`); it has no code path that reads `modelPolicy` from
the lock, computes a fresh comparison, or renders an old/new model table.

## Expected GREEN proof

Focused CLI upgrade tests proving: a changed bundled catalog produces a
correct old/new table with the right reason per row for a v3-opted profile;
an enabled mapping-v2 profile produces a correct legacy-vs-v3 comparison
table and the same five planning paths; each planning path yields the
documented deterministic plan for both profile shapes; declining (or an
unchanged v3 profile choosing Retain) produces a byte-identical no-op.

## Seam under test

`profile + (lock.modelPolicy or legacy resolver output) + live catalog ->
upgrade comparison table + plan`.

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

I6b and I6d can start once this item's comparison helper's shape is stable,
attaching optional steps to the same command rather than modifying this
item's core comparison/planning logic. I6c also depends on this item, but
additionally requires I6b to land first (not merely stabilize) - see I6c's
own Dependencies section. I6e depends on this item's write path existing.

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
reason accounted for) for both v3-opted and mapping-v2 profiles, determinism
of each planning path, and decline/unchanged-profile no-op behavior.
