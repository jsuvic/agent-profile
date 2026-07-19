# I6d: Tabnine model-resolution reconciliation

## Parent spec or request

`docs/specs/phase-31.5/issues/006-upgrade-and-lock-resolution.md` (I6). Split
out 2026-07-19 alongside I6a/I6b/I6c/I6e. Base I6 explicitly scoped Tabnine
rows out of its "ordinary compile reuses the lock" primitive as a disclosed
non-goal; this item closes that gap.

## Intent summary

Extend the already-shipped Codex/Claude lock-reuse guarantee to Tabnine rows,
so a Tabnine exact override or I3's historical/organization/private model
resolution is also retained across ordinary compiles instead of silently
re-deriving, and participates correctly in I6a's upgrade table/planning
paths.

## Behavior slice

`toLockModelPolicyTabnineResolutions`/`buildModelPolicyTabnineTargetTable`
(`packages/compiler/src/model-policy-tabnine-adapter.ts`) gain the same
previous-lock-aware reconciliation `deriveLockedClientOverride` already
provides for Codex/Claude: an unchanged Tabnine role/exact-override is
reused verbatim from the prior lock (including its per-row `catalogVersion`,
already added in base I6), while an explicit profile-side change or removed
override re-resolves fresh. I6a's upgrade comparison table includes Tabnine
rows on the same terms as Codex/Claude.

## Non-goals

- Any change to I3's historical/organization/private model catalog semantics
  themselves.
- Upgrade comparison/planning UI beyond making Tabnine rows visible in it
  (I6a owns the table/planning presentation).

## Acceptance criteria

- An unchanged Tabnine role (same preset, no new override) reuses its prior
  lock row verbatim across an ordinary compile, exactly like Codex/Claude
  rows today.
- Removing a previously-set Tabnine exact override re-resolves to guided
  manual selection (today's default), not a perpetuated stale override -
  mirrors the Codex/Claude fix for the same bug class.
- A Tabnine row's `catalogVersion` is correctly attributed (fresh vs.
  reused), consistent with the existing per-row field.
- `.tabnine/agent/settings.json` ownership/write semantics (I3, I5R) are
  unaffected.

## Expected RED proof

Tabnine rows are explicitly excluded from `deriveLockedClientOverride`
today (`packages/compiler/src/model-policy-target-adapter.ts`'s
`resolveModelPolicyLockfile` merges Tabnine resolutions in unreconciled); a
bundled Tabnine catalog change would silently remap a retained Tabnine
choice the same way the base I6 defect affected Codex/Claude before that fix.

## Expected GREEN proof

Focused tests mirroring `packages/compiler/src/model-policy-lockfile-reuse.test.ts`'s
existing Codex/Claude cases (reuse, override-wins, preset-change-forces-fresh,
override-removed-forces-fresh, no-previous-lock), applied to Tabnine rows.

## Seam under test

`profile + prior lock's Tabnine rows + live Tabnine catalog -> reconciled
Tabnine resolution`.

## Allowed mock boundary

None needed - pure logic, no filesystem/network/clock access, matching the
base I6 primitive's mock boundary.

## Test command guidance

Run focused `packages/compiler` model-policy-tabnine tests, then affected
workspace suites, goldens, and check.

## Likely file ownership

- `packages/compiler/src/model-policy-tabnine-adapter.ts`
- Tabnine-adapter and lockfile-reuse tests/fixtures

## Dependencies

I3 (Tabnine adapter), base I6 (shipped `deriveLockedClientOverride`
mechanism to extend).

## Parallelism notes

Can proceed in parallel with I6b and I6c once I6a's command shape is stable;
independent of I6e.

## Contract impact

Extends the existing `LockModelPolicyResolutionV2` reconciliation to Tabnine
rows. No schema change (Tabnine rows already carry `catalogVersion` per base
I6's fix).

## Security impact

None - pure logic change, no new I/O.

## Documentation impact

Note that Tabnine rows now participate in the same reuse guarantee as
Codex/Claude.

## Review expectations

Inspect parity with the existing Codex/Claude reconciliation test suite (same
branch coverage), and confirm no regression to I3/I5R's Tabnine
ownership/write contracts.
