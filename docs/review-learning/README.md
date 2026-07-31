# Review learning records

One normalized `review-learning/v1` record per reviewed pull request or
change, so blocking and smaller findings stay comparable across changes
instead of living in a pull-request thread that ages out.

These records are **workflow artifacts, not generated output**. The compiler
does not produce them, the lockfile does not track them, and `compile` will
never overwrite them. A workflow agent writes one by following the generated
`subagent-driven-change` instructions; `docs/review-learning/` is excluded
from snapshot identity, so adding a record never invalidates a terminal review
result.

## What never goes in

- Raw prompts, transcripts, hidden reasoning, or unfiltered tool output. Those
  stay in a local ignored location.
- Full diffs or reproduced source beyond the minimum needed to locate a defect.
- Secret-shaped values. Describe them by shape; never copy the literal.
- Unknown provider or model versions guessed at. Record `unknown`.

## File layout

- `docs/review-learning/<head-id>.md` — one record per reviewed change.
- `docs/review-learning/proposals/` — proposed promoted-rule patches awaiting a
  decision; applying one is a separate, explicit step.

## Schema: `review-learning/v1`

Closed values come from the shared change-risk policy source; this document
describes the record's own field relationships and does not restate a
vocabulary. `packages/compiler/src/review-learning-record.ts` validates a
record and renders its Markdown deterministically.

### Record fields

| Field                    | Required                              | Notes                                                                                                                                        |
| ------------------------ | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion`          | always                                | `review-learning/v1`. Separate from the policy that produced the review.                                                                     |
| `date`                   | always                                | UTC ISO 8601 calendar date, exactly `YYYY-MM-DD`. Timestamps, offsets, and local-timezone forms are malformed.                               |
| `sourcePolicy`           | always                                | `change-risk/v2` for a run this workflow executed, or `legacy-external` when the entire orchestration was outside it.                        |
| `productVersion`         | when known                            |                                                                                                                                              |
| `baseId` / `headId`      | always                                | Commit identifiers bounding the reviewed change.                                                                                             |
| `worktreeSnapshotId`     | when uncommitted content participated |                                                                                                                                              |
| `reviewerSurface`        | always                                | The surface that executed the review.                                                                                                        |
| `reviewerSurfaceVersion` | when known, else `unknown`            |                                                                                                                                              |
| `logicalInvocationCount` | on a local record only                | Omitted on `legacy-external`; never fabricated.                                                                                              |
| `transientAttemptCount`  | on a local record only                | Same rule.                                                                                                                                   |
| `terminalStatus`         | always                                | `clean`, `no-progress`, or `needs-human-review` on a local record; `external-only` on a `legacy-external` record. The two sets are disjoint. |
| `roundOutcomes`          | always, at least one                  | See below.                                                                                                                                   |
| `findings`               | always                                | May be empty for a clean first-round review.                                                                                                 |

### `roundOutcomes[]`

| Field                       | Required                 | Notes                                                |
| --------------------------- | ------------------------ | ---------------------------------------------------- |
| `round`                     | always                   | 1-based.                                             |
| `source`                    | always                   | `local` or `external`, per round.                    |
| `blockerCount`              | always                   |                                                      |
| `clustersFormed`            | local records only       | Cluster keys of any clusters that formed this round. |
| `clusterRecurrence`         | local records only       | `none`, `guard-added`, or `guard-impractical`.       |
| `guardEvidence`             | with `guard-added`       | What the guard is.                                   |
| `guardImpracticalityReason` | with `guard-impractical` | Why no guard was practical.                          |

Cluster events are persisted separately from category counts. Cluster identity
deliberately diverges from the promotion taxonomy and one cluster may span
categories, so collapsing the two would corrupt recurrence counting. A
`legacy-external` record omits cluster data rather than fabricating it.

### `findings[]`

| Field                     | Required                     | Notes                                                             |
| ------------------------- | ---------------------------- | ----------------------------------------------------------------- |
| `fingerprint`             | always, unique in the record | Stable, human-readable, derived from structured fields.           |
| `source`                  | always                       | `local` or `external`, per finding.                               |
| `provider`                | on every external finding    | `unknown` when unidentifiable. Absent on a local finding.         |
| `category`                | always                       |                                                                   |
| `categoryTaxonomyVersion` | always                       | Versioned separately from the policy and the record schema.       |
| `priority`                | always                       |                                                                   |
| `affectedContract`        | always                       |                                                                   |
| `evidence`                | always, at least one         | Locations, not reproductions.                                     |
| `safePath`                | always                       |                                                                   |
| `resolution`              | always                       | Exactly one allowed resolution per finding.                       |
| `disposition`             | on every P3, absent on P1/P2 | Exactly one allowed disposition.                                  |
| `dispositionConfirmed`    | on every P3                  | `false` until the owner confirms a reviewer-proposed disposition. |
| `dispositionEvidence`     | on every open P3             | The owner's decision evidence.                                    |
| `systemic`                | on every validated P1        | With `systemicReason` when true. Absent on P2/P3.                 |

A finding resolved `false-positive` requires evidence that explains how it
invalidates the reported unsafe condition.

Record-level `sourcePolicy` names the orchestration that produced the record.
A local run that incorporates a validated external finding stays a
`change-risk/v2` record and keeps its local counters; the external
contribution is marked per round and per finding instead. Provenance is never
collapsed into a single value.

## Template

Copy `template.md` and fill it in, or render it from a validated record with
`renderReviewLearningRecordV1`.
