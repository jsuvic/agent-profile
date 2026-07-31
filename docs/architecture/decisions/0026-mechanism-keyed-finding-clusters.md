# ADR 0026: Mechanism-Keyed Finding Clusters

## Status

Accepted 2026-07-28 with phase-33/002.

## Context

The change-risk workflow can bound a review loop but not diagnose one. A
finding fingerprint is deliberately stable across rounds for the same finding
so closure can be verified; nothing groups distinct findings that share one
cause. Repeated same-cause misses inside one reviewed change therefore consume
a fix round each, and the promotion contract's occurrence unit collapses them
to a single occurrence, so no recurrence threshold can fire.

Grouping findings needs a key. The obvious candidate reuses the fingerprint's
own components, including `category`, which would align clustering exactly
with promotion's recurrence counting.

PR #139 refuted that. Six findings across two rounds shared one root cause - a
hand-enumerated high-risk glob table missing newly added files - but scattered
across categories: a missing process-execution glob reads as
`network-process-boundary`, a missing generated-ownership glob reads as
`ownership-atomicity`. `change-risk-categories/v1` classifies product risk,
not defect mechanism, so one mechanism routinely spans several categories.
Including `category` in the key would have split the exact cluster the
mechanism exists to catch, and would have delayed the escalation by a round.

## Decision

The cluster key is `affectedContractId + unsafeConditionClass`. `category` is
excluded.

Cluster identity keys on defect mechanism and deliberately diverges from the
promotion taxonomy. A cluster may span categories; promotion continues to
count categories from persisted records independently of how clustering
grouped them.

Both components are closed, reviewer-supplied identifier vocabularies in the
shared policy source, each with an `other` fallback that never clusters. This
mirrors the shape `change-risk-categories/v1` already proves: a closed set is
the primary mechanism and an alias table is only a safety net for variant
labels. The rejected alternative - free text normalized by an owner-side alias
table - inverts that, and because a v1 alias table starts empty it would ship
inert, clustering only byte-identical reviewer prose.

`ChangeRiskContractId` widens from seven high-risk-surface identifiers to
cover affected contracts generally and becomes the `affectedContractId`
vocabulary, resolving its previously disclosed status as an unsanctioned
invention.

## Consequences

Clustering catches causes that span product-risk categories, which is the
common case for defects in shared enumerations, ownership tables, and
generated-output plumbing.

Cluster identity and promotion identity diverge, so the learning record must
persist cluster events separately from category counts; that separation is
load-bearing rather than incidental.

A reviewer mislabelling either component silently splits a cluster. There is
no mechanical detection. Behavior degrades to the pre-amendment baseline
rather than failing loudly.

A genuinely novel mechanism lands in `other` and does not cluster. This is
self-correcting: a recurring `other` is visible in the learning record and is
the signal to add a canonical identifier in a taxonomy-version bump.

Reviewer prompt context grows by two vocabularies, estimated at 15-20
identifiers, which cuts against the parent spec's context-footprint goal. I1's
pinned ablation baseline must therefore be rendered after these vocabularies
land, or I6's comparison measures two different prompt shapes.

## Alternatives Considered

- **Include `category` in the cluster key.** Rejected: refuted by the only
  corpus available, and its benefit (alignment with promotion counting) is
  largely cosmetic since promotion counts from persisted records regardless.
- **Free text plus an owner-side alias table.** Rejected: zero reviewer burden
  and no added prompt context, but an empty v1 alias table means clusters form
  only on byte-identical prose, so it ships inert and becomes useful only
  after humans hand-populate aliases from observed misses.
