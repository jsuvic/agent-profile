# I6e: Upgrade write ownership refusal and rollback

## Parent spec or request

`docs/specs/phase-31.5/issues/006-upgrade-and-lock-resolution.md` (I6). Split
out 2026-07-19 alongside I6a/I6b/I6c/I6d; carries forward I6's still-open
rollback/ownership acceptance criterion.

## Intent summary

Make sure an approved upgrade's actual filesystem writes (profile, target
files, lockfile) follow the same unowned/drifted-file refusal contracts as
`compile`/`init`, and that any partial failure during the upgrade's
multi-file write rolls back cleanly.

## Behavior slice

Once a plan is approved (I6a), applying it writes the profile, any changed
target files, and the lockfile using the existing atomic write-plan
machinery: `packages/compiler/src/write-plan.ts`'s `applyWritePlanAtomic`
(the actual all-or-nothing multi-file writer/rollback) combined with
`apps/cli/src/compile-plan.ts`'s region-aware refusal/planning logic - both
already proven for `compile --write` and `init`.
A target file that is unowned or drifted from what the lock last recorded is
refused exactly as `compile` refuses it today (no upgrade-specific carve-out).
If any write in the batch fails partway through, every already-committed
write in that batch is rolled back, leaving the repository exactly as it was
before the upgrade was applied.

## Non-goals

- Any new write-plan mechanism - this item verifies/wires the *existing*
  atomic write-plan and refusal contracts into the upgrade write path, it
  does not invent new ones.
- Upgrade comparison/planning logic (I6a).

## Acceptance criteria

- Existing unowned/drifted target files follow current refusal/
  reconciliation contracts; an upgrade is refused (not silently overwritten)
  under the same conditions `compile` refuses today.
- Partial failure during an upgrade's write rolls back every already-
  committed write in that same batch; the repository ends up byte-identical
  to its pre-upgrade state.
- A successful upgrade write leaves the lockfile fully consistent (correct
  `modelPolicy` rows, correct `catalogVersion` per row, correct `outputs`)
  with no orphaned or partially-updated state.
- Declining the upgrade at the final confirmation step writes nothing.

## Expected RED proof

There is no upgrade write path yet to test (I6a lands the plan; this item
lands and verifies the write). Once I6a exists, without this item's
verification the write path could plausibly reuse `applyWritePlanAtomic`
(`packages/compiler/src/write-plan.ts`) incorrectly (e.g. omitting the
lockfile from the same atomic batch as target files, breaking the rollback
guarantee across all three artifact kinds).

## Expected GREEN proof

Focused tests proving: an unowned/drifted target file refuses the upgrade
exactly as `compile` would; a forced mid-batch failure (matching the existing
rollback test pattern in `packages/compiler/src/write-plan.test.ts`, e.g.
"applyWritePlanAtomic rolls back already-committed writes when a later
rename fails") leaves the repo byte-identical to before; a successful
upgrade's resulting lock passes full schema validation with no orphaned
fields.

## Seam under test

`approved upgrade plan -> atomic multi-file write (profile + targets + lock)
-> committed or fully rolled back`.

## Allowed mock boundary

Filesystem writer, to simulate a mid-batch failure (matching existing
rollback test patterns). Do not mock the write-plan or refusal logic itself.

## Test command guidance

Run focused `apps/cli` upgrade write tests plus `packages/compiler`'s
existing `write-plan.test.ts` rollback suite (reused, not duplicated), then
affected workspace suites and check.

## Likely file ownership

- CLI upgrade write-application wiring (`apps/cli/src/upgrade*.ts`, reusing
  `packages/compiler/src/write-plan.ts`'s `applyWritePlanAtomic` and
  `apps/cli/src/compile-plan.ts`'s region-aware refusal/planning logic - no
  new write mechanism)
- Upgrade write/rollback tests and fixtures

## Dependencies

I6a (needs an approved plan to apply).

## Parallelism notes

Independent of I6b, I6c, and I6d; can be developed once I6a's plan shape is
stable, in parallel with those three.

## Contract impact

No new write-plan mechanism; wires the upgrade command into the existing one.
No change to `compile`/`init`'s own refusal or rollback contracts.

## Security impact

None beyond the existing atomic-write guarantees already relied on by
`compile`/`init`.

## Documentation impact

Note that upgrade writes follow the same ownership/refusal/rollback
contracts as compile, with one example of a refused upgrade and one of a
rolled-back partial failure.

## Review expectations

Inspect that profile, target files, and lockfile are all part of one atomic
batch (not three independent writes that could partially succeed across
kinds), refusal parity with `compile`, and a genuine forced-failure rollback
test (not just code reading).
