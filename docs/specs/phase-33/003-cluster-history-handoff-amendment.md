# Spec Amendment: Cluster History in the Orchestration Handoff

## Status

Draft 2026-07-28, pending grill approval. Amends
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
