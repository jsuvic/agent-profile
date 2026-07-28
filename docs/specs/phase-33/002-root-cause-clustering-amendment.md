# Spec Amendment: Root-Cause Clustering for Change-Risk Findings

## Status

Approved 2026-07-28 from the root-cause clustering grill agreement of the
same date. Amends `001-change-risk-review-assurance.md`.

Supersedes the 2026-07-28 draft of this file. The draft keyed clusters on
`category + affected contract + unsafe-condition class`, coupled the
escalation trigger to cluster formation, and asserted the policy version
without stating the rule it relied on. The grill rejected all three; see
Decisions 1, 3, and 4 below.

## Problem

The approved change-risk contracts bound a review loop but cannot diagnose
one.

- The finding fingerprint is deliberately stable across rounds for the SAME
  finding, so closure can be verified. Nothing groups DISTINCT findings that
  share one cause; each arrives as an independent unit of remediation work.
- The same-fingerprint and blocker-count non-progress guards do not fire when
  every round finds different files with the same underlying defect. The
  blocker count can even rise while the workflow makes real patch-level
  progress against the wrong altitude.
- The promotion contract's occurrence unit is one reviewed change, so
  repeated same-class misses inside one change deduplicate to a single
  occurrence and can never trip the second- or third-occurrence thresholds,
  however many rounds they consume. The only in-change escape is the
  promoted-rule lifecycle's discretionary clause - a mechanical guard MAY be
  introduced early when clearly practical and proportionate - which is a
  judgement call with no trigger.

The result is a loop that stops via `NO_PROGRESS`/`NEEDS_HUMAN_REVIEW` with a
count, not a diagnosis.

## Motivating Evidence

PR #139, the first I1 slice, is the live sample: three review rounds, 25
findings, of which six across rounds 2 and 3 shared one root cause - a
hand-enumerated high-risk glob table that keeps missing newly added files. The
loop was ended by human judgement introducing a mechanical guard, and that
judgement was initially justified by misciting the third-occurrence promotion
rule, which the occurrence unit makes inapplicable within one change. The
miscitation is itself evidence: the rule an engineer reaches for does not
exist.

## Intent

Let the workflow recognize that N findings are one defect, remediate the cause
once, and escalate to a structural guard when a patch-level fix proves to be
the wrong altitude - without adding budget, weakening clean-room isolation, or
making the reviewer aware of cluster history.

## Decision Rules

1. Shared-cause doubt -> group open findings by cluster key before scoping a
   fix round; remediate the cause once, not each member.
2. Altitude doubt -> a same-key repeat across rounds of one change means the
   patch-level fix was the wrong altitude; require a mechanical guard, or
   escalate with the impracticality recorded.
3. Vocabulary doubt -> prefer `other` over forcing a bad fit; a recurring
   `other` is the signal to add a canonical identifier in a taxonomy-version
   bump, not a reason to mislabel.

## Contract Changes

### Cluster-key contract (new)

- The cluster key is `affectedContractId + unsafeConditionClass`.
- `category` is deliberately EXCLUDED. `change-risk-categories/v1` is a
  product-risk taxonomy, so one defect mechanism scatters across categories;
  including it splits exactly the clusters this amendment exists to catch.
  See ADR 0026.
- Both components are closed, reviewer-supplied identifier sets owned by the
  shared change-risk policy source, each with an `other` fallback. A finding
  whose either component is `other` never clusters.
- `ChangeRiskContractId` widens from its current seven high-risk-surface
  identifiers to cover affected contracts generally, and becomes the
  sanctioned `affectedContractId` vocabulary. This resolves its previously
  disclosed status as an unsanctioned invention.
- `unsafeConditionClass` is a new closed vocabulary naming the defect
  mechanism, not the product risk.
- Shared deterministic code derives the cluster key exactly as it normalizes
  fingerprints; no generated surface re-derives it from prose.
- A reviewer supplies its own finding's two components and never receives
  cluster keys, cluster membership, cluster counts, or cluster history.
  Clustering happens after a round returns. Remediation prompts MAY name the
  shared cause of a cluster being fixed, exactly as they may carry the
  preceding round's fingerprints.

### Batch-clustering rule (amends the retry and escalation contract)

- When a completed review returns three or more open findings sharing one
  cluster key, the orchestration owner treats them as one systemic cluster:
  the next fix round targets the shared cause and verifies every member
  fingerprint against it.
- A cluster consumes fix-round and invocation budget exactly as ordinary
  findings do. Clustering re-scopes remediation; it never adds budget.
- The threshold governs batching only. It is not a correctness boundary and
  does not gate the escalation trigger below.
- For promotion recurrence counting, a cluster remains one occurrence per
  reviewed change, unchanged from the approved occurrence unit.

### Within-change cluster recurrence (amends the retry and escalation contract)

- The trigger fires when a later round of the same change reports a NEW
  fingerprint whose cluster key matches ANY finding remediated in an earlier
  round of that change - whether or not that earlier finding was part of a
  formed cluster.
- When it fires, the patch-level remediation is deemed insufficient for that
  cluster key. The next fix round for it MUST introduce a mechanical or
  interface-level guard (test, lint, validator, schema, or shared helper)
  where practical, converting the promoted-rule lifecycle's discretionary
  early-guard clause into a requirement for this case.
- When no such guard is practical, the workflow escalates to
  `NEEDS_HUMAN_REVIEW` with the impracticality recorded, rather than
  attempting a further patch-level round against the same cause.
- This trigger is within-change only. It does not alter the cross-change
  second- and third-occurrence thresholds; the learning record persists the
  cluster event so cross-change counting still works from recorded categories
  as approved.

### Versioning rule clarification (amends the review policy version contract)

- The workflow-policy version increments on a contract change only once a
  `change-risk/v1` artifact has been emitted or a `review-learning/v1` record
  persisted. Amendments made before first emission are absorbed into the
  current version.
- This amendment therefore keeps `change-risk/v1` despite changing the closed
  result envelope and escalation outcomes, because no reviewer artifact has
  been emitted and no record persisted. See ADR 0027.
- The rule is stated rather than left as precedent because this is the second
  amendment to rely on it.

### Learning-record addition (amends the review-learning record contract)

- A `change-risk/v1` record persists, per round, the cluster keys of any
  clusters formed and whether a within-change cluster recurrence fired,
  including the guard introduced or the recorded impracticality.
- Records with `sourcePolicy: legacy-external` omit cluster data rather than
  fabricating it.

## Non-Goals

- No change to fingerprint identity, closure verification, or the closed
  result envelope statuses.
- No change to clean-room context isolation: initial and final reviewers never
  receive cluster keys, cluster counts, or cluster history.
- No new model-policy role, profile-schema option, or reviewer identifier.
- No cross-change clustering memory in reviewer or orchestration context;
  cross-change learning remains the promotion contract's job.
- No additional retry, fix-round, or invocation budget.

## Ownership

- I7: the two closed vocabularies and cluster-key derivation beside fingerprint
  normalization in the shared policy source, plus the widened
  `ChangeRiskContractId`.
- I2: the batch-clustering and within-change recurrence transitions in the
  orchestration state machine.
- I3: the learning-record cluster fields.
- I4: consuming persisted cluster events in promotion counting; thresholds
  unchanged.

## Acceptance Criteria

1. Cluster-key derivation is deterministic, lives in the shared policy source,
   and has focused unit tests including: two findings with different locations
   and different categories but one cluster key; two findings differing only
   in `unsafeConditionClass`; and a finding with `other` in either component
   proving it never clusters.
2. Table-driven state-machine tests cover a three-member cluster remediated as
   one fix round; a within-change recurrence fired by a single earlier
   non-clustered finding; the impracticality escalation; and a two-member
   same-key pair in one round handled as ordinary findings.
3. Initial and final clean-room prompt fixtures prove cluster data is absent.
4. Record fixtures cover a round with a formed cluster, a fired recurrence
   with its guard, an impracticality escalation, and a `legacy-external`
   record with no cluster data.
5. Budgets are unchanged: no test may show clustering granting an extra
   invocation or fix round.
6. A test proves the emitted policy version is `change-risk/v1` and that the
   versioning rule's emission precondition is stated in the policy source.

## Known Risks

- A reviewer mislabelling either component silently splits a cluster. There is
  no mechanical detection; behavior degrades to the pre-amendment baseline
  rather than failing loudly.
- The recurrence trigger fires readily by design. Two loosely related findings
  sharing a cluster key across rounds will demand a guard; the impracticality
  escape absorbs this but adds pressure toward disproportionate guards.
- Reviewer prompt context grows by two vocabularies (estimated 15-20
  identifiers total), cutting against the parent spec's context-footprint
  goal.
- Sequencing: I1's pinned pre-simplification ablation baseline MUST be
  rendered after these vocabularies land, or I6's context-ablation comparison
  measures two different prompt shapes and its recovery threshold is not
  meaningful.
