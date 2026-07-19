# I6: Explicit model upgrade and locked resolution lifecycle

## Parent spec or request

`docs/specs/phase-31.5/001-model-selection-lifecycle.md`

## Intent summary

Let existing repositories adopt mapping v3 or retain older exact choices
without an Agent Profile package update silently changing generated behavior.

## Behavior slice

Upgrade reads portable intent plus legacy/locked provenance, compares exact old
and v3 candidate resolutions, offers retain/adopt/customize and optional probe
or package-metadata check, then previews and atomically writes approved profile,
target, and lockfile changes. Ordinary compile reuses the lock.

## Non-goals

- Automatic package installation, remote catalog mutation, or forced migration.
- Phase 32's general editable capability-update engine.
- Treating a newer recommendation as an error.

## Acceptance criteria

Split 2026-07-19 into this item's own foundational scope (both bullets below,
now DONE) plus five carried-forward sub-briefs (I6a-I6e) that own the
remaining bullets - see "Implementation context" for the full mapping.

- DONE: Mapping-v2 profiles remain unchanged under ordinary compile and an
  upgrade decline.
- DONE: Lockfile provenance is stable, round-trippable, and authoritative for
  normal compile until the next approved upgrade.
- Moved to I6a: Upgrade tables show exact old/new models, effort,
  alternatives, lifecycle, capability status, and reason for each changed
  role/client; retain/adopt/quality-first/cost-conscious/custom-exact paths
  produce deterministic plans.
- Moved to I6b: An optional metadata-only registry check reports a newer
  package/catalog and manual update guidance; it never downloads or installs.
- Moved to I6c: Probe consent is separate from update-check consent and
  writes no availability result.
- Moved to I6d (not an original bullet, but required for I6a's comparison
  table to be complete): Tabnine rows participate in the same lock-reuse
  guarantee as Codex/Claude.
- Moved to I6e: Existing unowned/drifted target files follow current
  refusal/reconciliation contracts; partial failure rolls back.

## Expected RED proof

Current upgrade knows the capability catalog but not model catalog/resolution;
updating the bundled mapping would change generated guidance without exact
retain/adopt provenance.

## Expected GREEN proof

Focused upgrade/compile/lock tests prove every choice, consent branch, no-op,
legacy migration, conflict, rollback, and stable subsequent compile.

## Seam under test

`profile + lock + catalog + user choices -> upgrade report/filesystem effect`.

## Allowed mock boundary

Package metadata HTTP lookup, probe port, clock, and filesystem writer. Do not
mock resolution or upgrade planning.

## Test command guidance

Run focused upgrade editor/CLI, lockfile, compiler compatibility, and network
sentinel tests, then affected workspace suites, goldens, check, and pack.

## Likely file ownership

- core upgrade catalog/model impact types
- CLI upgrade planner/editor/presentation and optional update check
- compiler prior-lock resolution and lockfile serialization
- upgrade/compile integration tests and fixtures

## Dependencies

I1, I2, I3, and I4.

## Parallelism notes

Can run parallel with I5 after shared contracts stabilize; serialize shared CLI
entrypoint and presentation edits.

## Contract impact

Adds model-aware upgrade planning and lock consumption. Capability-catalog
semantics and existing insertion-only safety remain unchanged.

## Security impact

Two explicit network consents, no auto-install, no raw provider output, and
existing ownership/atomic rollback requirements.

## Documentation impact

Upgrade lifecycle, old/new examples, package update guidance, rollback, and
legacy mapping-v2 behavior.

## Implementation context

Do not overload `upgrade.catalogVersion`; model catalog/resolution provenance
is a separate lockfile concern with its own version.

2026-07-18: First RED-first cycle landed the "ordinary compile reuses the
lock" primitive: `resolveModelPolicyLockfile` (`packages/compiler/src/
model-policy-target-adapter.ts`) now accepts an optional `previousModelPolicy`
and reuses a prior lock's exact per-role/per-client row verbatim when the
preset is unchanged and that role has no explicit per-role override; a
changed preset or an explicit override still forces fresh catalog resolution.
Wired into the real compile path at `apps/cli/src/compile-plan.ts`
(`planRegionAwareWrites` surfaces `lockfile.modelPolicy` as
`previousModelPolicy`, no new file read) and threaded through the 3
`buildCompileWrites` call sites in `index.ts` that actually pass a `profile`
(the real `compile`/`init` write paths) — these meaningfully participate in
the reuse guarantee and are covered by an end-to-end regression test
(`apps/cli/src/compile-plan.test.ts`). Two call sites remain non-participating,
both pre-existing gaps rather than regressions: `dispatch.ts`'s
`buildCompileWrites` call was also given a `previousModelPolicy` argument, but
since that call never passes `profile` either, `resolveModelPolicyLockfile` is
never invoked there and the wiring is presently inert (harmless, but does not
extend the guarantee to the dispatcher's dry-run write-count check).
`configure.ts:702` remains fully unwired: that call site does not pass a
`profile` to `buildCompileWrites` at all today, so no `modelPolicy` is
resolved there regardless.
Still outstanding for future cycles: the CLI `upgrade` command's model-aware
retain/adopt/customize UX, the metadata-only registry check, probe-consent
separation, and Tabnine reconciliation (all of I6's remaining acceptance
criteria).

2026-07-19: also found and fixed (as a separate PR, not part of this item)
that `apps/cli/src/configure.ts`'s own `buildCompileWrites` call omitted
`profile`, so every lockfile `configure` wrote silently erased its
`modelPolicy` block - a pre-existing bug independent of I6, surfaced by this
work. See that PR for the fix.

2026-07-19: this item's remaining acceptance criteria are split into five
sub-briefs so each can run as its own bounded RED-first cycle rather than one
oversized task - I6a (upgrade comparison/planning), I6b (metadata-only
registry check), I6c (probe consent separation), I6d (Tabnine reconciliation,
not an original bullet but required for I6a's table to be complete), I6e
(write ownership/rollback). This item (I6) is now considered done for its
own narrowed scope: the "ordinary compile reuses the lock" primitive.

## Review expectations

Inspect no-silent-remap proof, exact comparison completeness, consent
separation, lock determinism, unowned-file behavior, and rollback.
