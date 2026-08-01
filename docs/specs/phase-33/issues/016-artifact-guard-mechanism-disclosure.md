# I16: Disclose the artifact guard's compile-and-compare mechanism for ratification

## Parent spec or request

`docs/specs/phase-33/issues/014-self-applied-artifact-drift-guard.md`

Raised 2026-08-01 by the final clean-room change-risk review of I14, snapshot
`5db443e`. P3, `follow-up`, fingerprint
`preview-before-write-ordering|contract-completeness|docs/specs/phase-33/issues/014-self-applied-artifact-drift-guard.md|Implementation divergences (disclosed, owner ratification required)|other`.

## Intent summary

I14's brief prescribes a dry run. The implementation runs a real
`compile --write` inside a temporary materialization of `HEAD`'s tree. The
repository-facing no-write property the brief actually cares about is preserved
and sentinel-proven, but the mechanism substitution is not in the numbered
divergences section the owner is being asked to ratify.

## Behavior slice

I14's behavior slice says "Assert that a dry-run compile of this repository
reports zero `create` and zero `change`", then "The guard must not write", and
its review expectations say "Push back if the guard regenerates rather than
reports".

The implementation instead materializes every committed blob of `HEAD` into an
`os.tmpdir()` directory and runs `agent-profile compile --root <tmp> --write`
there, because a dry run reports action counts and not BYTES, and a
byte-for-byte comparison against the commit needs the bytes. The written
lockfile is also what supplies authoritative per-path ownership.

The repository-facing property holds: the whole-tree sentinel test hashes every
file outside `node_modules`, `.git` and `.claude/worktrees` before and after a
real run and asserts the only changed paths are gitignored build output. So
this is a disclosure gap, not a behavioural defect.

What is undisclosed, specifically:

1. That the guard regenerates at all, which is the exact thing the brief's
   review expectations tell a reviewer to push back on. Divergences 1-5 record
   the exemption widening, the stale-`dist` finding, the committed-bytes
   workflow cost, the `tsc`/`dist` write, and the orphan-sweep widening. None
   records replacing the dry run with a real write into a copy.
2. That every committed byte of the repository is written to a temporary
   directory on each run. The directory is `mkdtemp` (mode 0700) and removed in
   a `finally`, but not on `SIGINT`.

An owner ratifying divergences 1-5 would not learn either fact from that list.

## Non-goals

- Reverting to `--dry-run`. That would reintroduce the reason the mechanism was
  chosen: no bytes to compare and no authoritative ownership.
- Weakening or re-proving the no-write property. It is already sentinel-proven.
- Any change to `compile`.

## Acceptance criteria

- I14's divergences section records the mechanism substitution: that the guard
  does not use `--dry-run`, that it materializes `HEAD` into a mode-0700
  temporary directory and runs a real `compile --write` there, why byte
  comparison requires it, and that the sentinel-proven no-write property is
  repository-facing rather than absolute.
- The temporary-materialization footprint is stated, including that cleanup
  runs in a `finally` and not on `SIGINT`.
- The brief's own "The guard must not write" and "Push back if the guard
  regenerates rather than reports" lines are reconciled with what shipped, so a
  future reviewer reading only the brief does not raise the same finding a
  third time.

## Expected RED proof

Not a code defect, so no runtime RED. The proof of the gap is textual: I14's
divergences section at `5db443e` contains five entries and none mentions
`--write`, temp materialization, or the retained `--dry-run` wording in the
behavior slice.

## Seam under test

`what the guard does -> what the brief says it does`.

## Likely file ownership

- `docs/specs/phase-33/issues/014-self-applied-artifact-drift-guard.md`

## Dependencies

I14 merged.

## Contract impact

Documentation only. No code, no gate behaviour, no artifact change.

## Security impact

Improves it in the reporting sense: the temp-materialization footprint becomes
a stated property an owner can review rather than an inferred one. The
materialized tree contains committed bytes only, never the working copy, so an
owner's local `.claude/settings.json` override is not copied.

## Review expectations

Confirm the disclosure matches the code rather than the intent. Push back if it
softens the mechanism into "effectively a dry run" — it is a real write into a
real copy, and the ratification should say so plainly.
