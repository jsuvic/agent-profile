# Promoting recurring findings

A validated review miss should make the next review better, and eventually
stop being a review problem at all. This describes how a finding earns a
stronger guard, and what promotion may and may not write.

Closed values and the exact action text come from the shared change-risk
policy source; `packages/compiler/src/change-risk-promotion.ts` computes the
decision. This document explains the model rather than restating the table.

## Recurrence is counted on canonical categories

- The occurrence unit is **one reviewed change**. Repeated rounds, and
  distinct fingerprints inside the same change, collapse to at most one
  occurrence for a category.
- Counting is keyed on the canonical `ChangeRiskCategory` identity after alias
  normalization. Raw reviewer wording never matches, and an unmapped label
  normalizes to `uncategorized`, which is excluded from recurrence entirely —
  an unclassifiable finding cannot accumulate toward a rule nobody can scope.
- Only validated outcomes count. A `fixed` finding counts. A `false-positive`
  or `obsolete` finding never counts. An `open` finding counts **only** when
  the persisted record carries a confirmed disposition _and_ the owner's
  decision evidence; either half alone leaves a threshold resting on an
  unvalidated opinion.

### Cluster events are not occurrences

Amendment 002's within-change cluster recurrence is a different signal with a
different answer. It fires inside one change and is satisfied by the
orchestration's mechanical-guard requirement, not by promotion. Cluster
identity is mechanism-keyed and one cluster may span categories (ADR 0026), so
substituting cluster keys into recurrence counting would corrupt the
thresholds. Cluster events are recorded as evidence; they never increment an
occurrence.

## The thresholds

| Occurrence             | What it earns                                                                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| First, systemic P1     | Immediate protection: regression test and a scoped rule.                                                                                        |
| First, non-systemic P1 | Record and categorize, plus a regression test where practical.                                                                                  |
| First, ordinary P2/P3  | Record and categorize.                                                                                                                          |
| Second                 | Reviewer regression case plus a scoped rule — unless an existing guard already gives equivalent or stronger protection, which is cited instead. |
| Third                  | A test, lint, validator, or shared helper where practical. The prompt rule alone has proven insufficient.                                       |

A mechanical or interface-level guard MAY arrive before the third occurrence
when clearly practical and proportionate. Prefer a guard over prose: add a
prompt rule only when model judgement remains part of the safe decision.

When no deterministic guard is practical at the third occurrence, that
impracticality is **recorded**, never silently skipped.

## Ownership: promotion proposes, it does not edit

- Promotion never silently modifies a compiler-generated instruction region.
  A generated-region target is refused outright.
- Within the reviewed change, promotion writes **only** a proposed-patch
  artifact under `docs/review-learning/proposals/`.
- Applying a proposal to `AGENTS.md` or another human-owned rule surface is a
  separate later change through the normal write boundary, reviewed and
  invalidating as usual.

## Rule shape and lifecycle

Every promoted rule records its `ruleId`, `sourceCategory`, `scope`,
`evidenceRecordReferences`, `dateIntroduced`, `mechanicalGuard`, and
`lifecycleStatus` (`active`, `superseded`, or `retired`).

A rule must be concise, consequential, scoped to the narrowest applicable
path, and must state both the unsafe condition and the safe path or a
counterexample.

When a deterministic guard gives equivalent or stronger protection, the
redundant prompt rule is removed, retired, or reduced to navigation guidance.
A retired rule is never rendered into generated context — the point of
promotion is to stop paying reviewer attention for something a machine can
check.
