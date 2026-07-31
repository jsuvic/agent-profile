# Spec Amendment: Cluster History in the Orchestration Handoff

## Status

Approved 2026-07-29. Amends
`001-change-risk-review-assurance.md` and completes
`002-root-cause-clustering-amendment.md`.

Scope is deliberately narrow: one closed handoff record gains one field.
This is a correction to an approved amendment, not new capability.

## Problem

Amendment 002's within-change cluster-recurrence trigger fires when a later
round reports a new finding whose cluster key matches any finding REMEDIATED
in an earlier round of the same change. Evaluating that requires knowing which
cluster keys were remediated.

The approved handoff record cannot supply it. `ChangeRiskOrchestrationStateV1`
carries `policyVersion`, `snapshotId`, status, the three counters, the
confirmation state, and - as progress history - per-completed-round blocker
counts and UNRESOLVED fingerprint checkpoints. Unresolved fingerprints are a
different set from remediated findings' cluster keys, and no other carried
field records what a fix round closed.

The learning record cannot substitute: it is persisted after the workflow
reaches a terminal state, so it does not exist while the loop is running.

Consequence: an orchestration that pauses and resumes between remediation
rounds silently misses within-change recurrences. The guard requirement never
fires, and the workflow degrades to exactly the patch-by-patch behavior
amendment 002 exists to prevent - without any signal that it has done so. A
continuously-running orchestration is unaffected, which makes the defect
intermittent and easy to miss in testing.

## Intent

Make amendment 002's trigger evaluable by a resumed owner, using the same
mechanism the approved contract already uses for fingerprint checkpoints.

## Contract Changes

### Handoff record addition (amends the context composition and ownership contract)

- `ChangeRiskOrchestrationStateV1`'s progress history additionally carries,
  per completed round, the cluster keys of findings that round remediated.
- Like the existing checkpoints, this may be carried inline or via a closed
  durable-state reference.
- A finding whose cluster key is absent - because either component is `other`
  - contributes nothing, consistent with amendment 002's rule that such
  findings never cluster.
- A resumed owner enforces within-change cluster recurrence from that carried
  history and never resets it, mirroring the existing rule for
  same-fingerprint recurrence and stagnation.
- `implement-next` and `final-review` continue to validate the record without
  interpreting it; this field adds no new consumer obligation for them.

### Checkpoint and remediation-claim integrity (added 2026-07-30)

Added from PR #140's automated review, which found the carried history
trustable only as far as the caller's own claims.

- The remediated cluster keys a completed round carries are DERIVED from the
  active blocker checkpoint that round remediated, never from an
  unverifiable caller-supplied list. A remediation claim naming a fingerprint
  or cluster key that is not active escalates to `NEEDS_HUMAN_REVIEW` instead
  of being recorded.
- The handoff record additionally carries the index of the first completed
  round its active checkpoint accumulates from. The checkpoint MUST equal the
  unresolved fingerprints of the rounds at and after that index - the latest
  local round plus every external round merged after it - so a serialized
  handoff cannot retain a blocker round while dropping its checkpoint.
- That index advances past every recorded round only when a validated clean
  review closed them, which a resumed owner checks against the record's own
  clean-review count.
- An out-of-band `code-changed` event moves the snapshot but closes nothing,
  so it carries the unresolved checkpoint into the next review rather than
  resetting it.
- Closure coverage is owed by any local review taken while the checkpoint is
  non-empty, not only by reviews that follow a fix round. Whether the snapshot
  moved through remediation or out of band, a review cannot close a change
  while a recorded blocker is unaccounted for.
- Each fix round answers exactly one completed blocker review. A second
  `fix-applied` with no review between them escalates to `NEEDS_HUMAN_REVIEW`
  rather than returning a handoff the validator rejects.
- A required mechanical guard is discharged only by a snapshot-changing
  `guard-added` carrying the resulting manifest and non-empty evidence, and
  the record keeps that evidence. Asserting a guard over unchanged bytes
  escalates: the guard must exist in the bytes the next review sees.
- Same-fingerprint non-progress is evaluated against the live checkpoint, not
  all recorded rounds. A fingerprint an earlier round verifiably closed may
  reappear on later bytes without stopping the loop.

### Derivable triggers and uniform fix-round accounting (added 2026-07-30)

Added from the third automated review round on the same PR.

- Every completed round records how many of its blockers were P1, and the
  record carries a sticky P1 observation. A handoff whose history contains a
  P1 round cannot present itself as un-observed, and the after-any-P1
  confirmation trigger is therefore derivable on resume rather than resting on
  a flag a resumed owner could drop.
- Cluster membership is a required field on every completed round, empty only
  for genuinely non-clusterable findings. An omitted array is indistinguishable
  from "nothing clusters here" and would silently erase the remediated history
  the guard trigger reads.
- A `guard-added` event IS the fix round for the review that demanded it: it
  is admitted and accounted through the same path as `fix-applied` (fix-round
  cap, one round per completed review, budget reservation, confirmation cap,
  remediated-cluster recording). The snapshot it names carries the guard and
  the remediation together, and a further `fix-applied` answering the same
  review is out of order. Without this a guard would be a free remediation
  change that bypasses the two-fix confirmation trigger.
- Every escalation records the round that produced it. A terminal handoff that
  counted a logical invocation without appending its completed round would
  contradict the invocation accounting the validator enforces, so the required
  escalation could be neither resumed nor reported.

### Repeated recurrence after a guard (amends the retry and escalation contract)

- When a cluster key recurs again after a within-change recurrence already
  required and introduced a mechanical guard for it, the guard did not hold.
  That transition escalates to `NEEDS_HUMAN_REVIEW` rather than requiring a
  further guard for the same key.
- This bounds guard demands for one cluster key at one per reviewed change,
  independently of the fix-round cap.

## Non-Goals

- No change to the cluster key, the batching threshold, the vocabularies, or
  the trigger condition established by amendment 002.
- No change to budgets, counters, or terminal-status semantics.
- No new persisted artifact; the learning record's cluster fields are
  unchanged and remain I3's.
- No cross-change cluster memory; this history is scoped to one reviewed
  change and is discarded with the orchestration state.

## Versioning

The workflow-policy version stays `change-risk/v1`. This changes the closed
handoff record, which the versioning rule would ordinarily increment, but no
`change-risk/v1` artifact has been emitted and no `review-learning/v1` record
persisted, so ADR 0027's emission precondition absorbs it.

Superseded 2026-07-30 for the version value only: PR #140 emitted the first
artifacts, the pre-emission exception lapsed, and the workflow-policy version
is now `change-risk/v2`. This amendment's contracts are unchanged.

## Ownership

- I7: no change. Cluster-key derivation is unaffected.
- I2: carries the new field in the handoff record and enforces recurrence and
  the repeated-recurrence escalation from it. This amendment must land before
  I2 implements the trigger.
- I3: no change.
- I4: no change.

## Acceptance Criteria

1. The handoff record type carries per-completed-round remediated cluster
   keys, inline or by closed reference.
2. A table-driven test proves a resumed owner - reconstructed from a
   serialized handoff record, not from in-memory state - fires the
   within-change recurrence trigger. This is the regression test for the
   defect above and MUST fail against a handoff record lacking the field.
3. A test proves a remediated finding whose cluster key is absent (`other` in
   either component) contributes nothing to the carried history.
4. A test proves a repeated recurrence after a guard escalates to
   `NEEDS_HUMAN_REVIEW` rather than demanding a second guard for the same key.
5. A test proves the carried history is never reset across a resume.
6. Budgets are unchanged.

## Known Risks

- The handoff record grows with the number of remediated findings. Bounded in
  practice by the three-fix-round cap, but a change with many findings per
  round carries a correspondingly larger record; the closed durable-state
  reference option exists for that case.
- The defect this corrects is intermittent by nature - it appears only across
  a resume boundary. Acceptance criterion 2 deliberately requires
  reconstruction from a serialized record, because an in-memory test would
  pass against the broken contract.
