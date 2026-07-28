# Spec Amendment: Root-Cause Clustering for Change-Risk Findings

## Status

Draft 2026-07-28, pending grill approval. Amends
`001-change-risk-review-assurance.md`. Because no `change-risk/v1` artifact
has been released, the workflow-policy version remains `change-risk/v1` on
approval, following the 2026-07-27 amendment precedent.

## Motivation

The PR #139 review history (the first I1 slice) is a live sample of the
loop this phase is designed to bound: three review rounds, 25 findings, with
round 3 alone returning eleven findings of which four shared one root cause
(a hand-enumerated high-risk glob table that misses newly added files).

The approved contracts would have bounded that loop but not understood it:

- The finding fingerprint is deliberately stable across rounds for the SAME
  finding, so closure can be verified. Nothing groups DISTINCT findings that
  share a cause; each cluster member arrives as an independent unit of
  remediation work.
- The same-fingerprint and blocker-count non-progress guards do not fire
  when every round finds different files with the same underlying cause -
  the blocker count can even rise while the workflow makes real patch-level
  progress against the wrong altitude.
- The promotion contract's occurrence unit is one reviewed change, so
  repeated same-class misses inside one change deduplicate to a single
  occurrence and can never trip the second- or third-occurrence thresholds,
  no matter how many rounds they consume. The only in-change escape is the
  promoted-rule lifecycle's discretionary clause (a mechanical guard MAY be
  introduced early when clearly practical and proportionate) - a judgement
  call with no trigger.

The result: the bounded loop stops via `NO_PROGRESS`/`NEEDS_HUMAN_REVIEW`
with a count, not a diagnosis.

## Decision Rules

1. Shared-cause doubt -> group open findings by cluster key before scoping a
   fix round; remediate the cause once, not each member.
2. Altitude doubt -> a new member of an already-remediated cluster in a
   later round of the same change means the patch-level fix was the wrong
   altitude; require a mechanical guard now instead of waiting for a
   cross-change threshold.

## Contract Changes

### Cluster-key contract (new)

- The cluster key is derived from the fingerprint's structured components
  minus the normalized location:
  `category + affected contract + unsafe-condition class`.
- Shared deterministic code in the change-risk policy source derives the
  cluster key exactly as it normalizes fingerprints; no surface re-derives
  it from prose.
- The cluster key is orchestration-owner data. It MUST NOT appear in
  initial or final clean-room reviewer context; clustering happens after a
  round returns, never as reviewer guidance. Remediation prompts MAY name
  the shared cause of a cluster being fixed, exactly as they may carry the
  preceding round's fingerprints.

### Batch-clustering rule (amends the retry and escalation contract)

- When a completed review returns three or more open findings sharing one
  cluster key, the orchestration owner treats them as one systemic cluster:
  the next fix round targets the shared cause and verifies every member
  fingerprint against it.
- A cluster consumes fix-round and invocation budget exactly as ordinary
  findings do; clustering re-scopes remediation, it never adds budget.
- For the promotion contract's recurrence counting, a cluster remains one
  occurrence per reviewed change (unchanged from the approved occurrence
  unit).

### Within-change cluster recurrence (amends the retry and escalation contract)

- If a later round of the same change reports a NEW fingerprint whose
  cluster key matches a cluster already remediated in an earlier round of
  that change, the patch-level remediation is deemed insufficient for that
  cluster.
- The next fix round for that cluster MUST introduce a mechanical or
  interface-level guard (test, lint, validator, schema, or shared helper)
  where practical, converting the discretionary early-guard clause of the
  promoted-rule lifecycle into a requirement for this case. When no such
  guard is practical, the workflow escalates to `NEEDS_HUMAN_REVIEW` with
  the impracticality recorded, rather than attempting a third patch-level
  round against the same cause.
- This trigger is within-change only. It does not alter the cross-change
  second- and third-occurrence thresholds, and the learning record persists
  the cluster event so cross-change counting still works from recorded
  categories as approved.

### Learning-record addition (amends the review-learning record contract)

- A `change-risk/v1` record persists, per round, the cluster keys of any
  clusters formed and whether a within-change cluster recurrence fired,
  including the guard introduced or the recorded impracticality. Records
  with `sourcePolicy: legacy-external` omit cluster data rather than
  fabricating it.

## Non-Goals

- No change to fingerprint identity, closure verification, or the closed
  result envelope statuses.
- No change to clean-room context isolation: initial and final reviewers
  never receive cluster keys, cluster counts, or cluster history.
- No new model-policy role, profile-schema option, or reviewer identifier.
- No cross-change clustering memory in reviewer or orchestration context;
  cross-change learning remains the promotion contract's job.

## Ownership

- I1 (follow-up cycle): cluster-key derivation next to fingerprint
  normalization in the shared policy source, with focused unit tests.
- I2: the batch-clustering and within-change recurrence transitions in the
  orchestration state machine.
- I3: the learning-record cluster fields.
- I4: consuming persisted cluster events in promotion counting (unchanged
  thresholds).

## Acceptance Criteria

1. Cluster-key derivation is deterministic, lives in the shared policy
   source, and has focused unit tests, including two findings with
   different locations but one cluster key and two findings differing only
   in unsafe-condition class.
2. Table-driven state-machine tests cover: a three-member cluster remediated
   as one fix round; a within-change cluster recurrence requiring a guard;
   the impracticality escalation; and a two-member non-cluster handled as
   ordinary findings.
3. Initial and final clean-room prompt fixtures prove cluster data is
   absent.
4. Record fixtures cover a round with a formed cluster, a fired recurrence
   with its guard, and a `legacy-external` record with no cluster data.
5. Budgets are unchanged: no test may show clustering granting an extra
   invocation or fix round.
