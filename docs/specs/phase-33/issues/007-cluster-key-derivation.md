# I7: Cluster vocabularies and cluster-key derivation

## Parent spec or request

`docs/specs/phase-33/002-root-cause-clustering-amendment.md`
(amends `docs/specs/phase-33/001-change-risk-review-assurance.md`)

## Intent summary

Give the shared change-risk policy source the two closed vocabularies and the
deterministic cluster-key derivation that I2, I3, and I4 consume, so no
orchestration slice invents clustering identity from prose.

## Behavior slice

Widen `ChangeRiskContractId` from its current seven high-risk-surface
identifiers to cover affected contracts generally, and add a new closed
`unsafeConditionClass` vocabulary naming the defect mechanism rather than the
product risk. Both carry an `other` fallback.

Add `deriveChangeRiskClusterKey`, a pure function producing
`affectedContractId + unsafeConditionClass` and returning no key when either
component is `other`. It sits beside fingerprint normalization and is the
single owner of cluster identity.

Add the versioning rule's emission precondition to the policy source so the
`change-risk/v1` retention was a stated, testable rule rather than a judgement
(ADR 0027).

Render both vocabularies into the reviewer projection's result interface, so a
reviewer can supply its own finding's two components. The reviewer projection
must NOT gain cluster keys, cluster membership, cluster counts, or cluster
history - those are orchestration-owner data.

## Non-goals

- Batch-clustering or recurrence transitions; I2 owns the state machine.
- Learning-record cluster fields; I3 owns the record schema.
- Promotion counting changes; I4 owns that and its thresholds are unchanged.
- Any budget change.
- The pinned ablation baseline fixture; see the sequencing constraint below.

## Acceptance criteria

- `ChangeRiskContractId` covers affected contracts generally and is no longer
  scoped to high-risk surfaces alone; existing high-risk surface predicates
  keep working unchanged.
- `unsafeConditionClass` is a closed vocabulary naming defect mechanisms, with
  an `other` fallback.
- `deriveChangeRiskClusterKey` is deterministic and pure, and returns no key
  when either component is `other`.
- Focused unit tests cover: two findings with different locations AND
  different categories sharing one cluster key; two findings differing only in
  `unsafeConditionClass`; and `other` in either component never clustering.
- The reviewer projection carries both vocabularies and carries no cluster
  key, membership, count, or history. Projection tests prove both.
- The emitted policy version is `change-risk/v2` (`change-risk/v1` when this
  brief was approved; incremented on 2026-07-30 once the first artifact had
  been emitted), and the versioning rule's emission precondition is stated in
  the policy source and tested.
- `category` is absent from cluster-key derivation, proven by a test using two
  findings whose categories differ.

## Expected RED proof

A unit test asserting `deriveChangeRiskClusterKey` groups two
different-category findings fails because neither the function nor the
`unsafeConditionClass` vocabulary exists.

## Expected GREEN proof

Policy unit tests and projection inclusion/exclusion tests pass; generated
output stays byte-identical, since no artifact renders these values yet.

## Seam under test

Pure policy source: `(finding components) -> cluster key`, plus the reviewer
projection's rendered vocabularies.

## Allowed mock boundary

None. Pure functions and frozen data.

## Likely file ownership

- `packages/compiler/src/change-risk-policy.ts`
- `packages/compiler/src/change-risk-policy.test.ts`

## Dependencies

`ready`. Depends on I1's shipped policy source, which exists. I2, I3, and I4
depend on this slice for cluster identity.

## Parallelism notes

Not parallel-safe with I2 or I3, which consume the vocabularies this slice
defines. Parallel-safe with I5.

## Sequencing constraint

I1's pinned pre-simplification ablation baseline fixture MUST be rendered
AFTER this slice lands. Rendering it first would pin a prompt shape without
these vocabularies, and I6's context-ablation comparison would then measure
two different prompt shapes rather than the projection change it intends to
evaluate.

## Contract impact

Widens one existing closed vocabulary and adds one new one; adds a pure
derivation function. No profile-schema change, no role-ID change, no budget
change. The workflow-policy version stayed `change-risk/v1` for this slice
per ADR 0027; it advanced to `change-risk/v2` on 2026-07-30 after the first
artifacts were emitted.

## Security impact

None beyond the existing posture. The added values are closed identifiers, not
content; no snapshot data, secret-shaped value, or transcript enters the
policy source.

## Documentation impact

`CONTEXT.md` review-assurance glossary already carries `cluster key`,
`cluster`, and `within-change cluster recurrence` from synthesis.

## Implementation context

The vocabularies are estimated at 15-20 identifiers total. Keep them small:
every identifier is rendered into the reviewer projection and costs context on
every invocation, which cuts against the parent spec's footprint goal. Prefer
`other` and a later taxonomy bump over a speculative identifier.

## Review expectations

Adversarially verify that a reviewer cannot infer cluster history from what it
receives, that `other` genuinely cannot cluster, and that widening
`ChangeRiskContractId` did not weaken any high-risk surface predicate that
already consumes it.
