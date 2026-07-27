# I5: Backfill the recent PR review corpus

## Parent spec or request

`docs/specs/phase-33/001-change-risk-review-assurance.md`

## Intent summary

Seed the learning taxonomy and regression corpus with the concrete failures
that exposed the current workflow gap.

## Behavior slice

Use sanitized checked-in thread-aware review fixtures for PRs #125 and
#127-#133, validate and normalize them into `review-learning/v1` records,
reconcile the approved priority totals, categorize root causes, and identify
the first rules or mechanical regressions required by the promotion policy.
Record the source date and disclose any review-thread state that changed after
the approved snapshot.

If required source evidence is missing, request explicit user approval
immediately before a live read-only GitHub fetch. Without approval, perform no
network call and stop with the missing evidence identified rather than
silently weakening the backfill.

## Non-goals

- Replying to, resolving, or editing GitHub review threads.
- Fixing the historical PR code in this slice.
- Copying raw review transcripts into the repository.
- Expanding the corpus beyond the approved eight PRs.
- Treating live GitHub access as the default input.

## Acceptance criteria

- Exactly eight PR/change records cover #125 and #127-#133.
- The approved snapshot reconciles to 126 findings: 23 P1 and 103 P2.
- Per-PR counts reconcile to:
  `#125 54 (13/41)`, `#127 7 (0/7)`, `#128 6 (0/6)`,
  `#129 16 (5/11)`, `#130 19 (3/16)`, `#131 10 (0/10)`,
  `#132 2 (1/1)`, and `#133 12 (1/11)`.
- Every normalized finding has a stable fingerprint, category, priority,
  evidence summary, affected contract/safe path, and closed resolution; P3
  also has its required disposition while P1/P2 omit disposition.
- The records distinguish the approved historical snapshot from later GitHub
  state instead of rewriting history.
- Recurring categories seed reviewer regression cases and promotion proposals.
- No GitHub mutation occurs.
- The default path makes no network call. A live review-thread read occurs only
  after explicit user approval; refusal leaves the fixtures unchanged and
  reports any missing evidence.

## Expected RED proof

A corpus reconciliation test fails because the eight normalized records and
their required totals do not exist.

## Expected GREEN proof

Schema validation and per-PR/total reconciliation pass; a category summary
maps recurring findings to the applicable promotion threshold.

## Seam under test

Deterministic transformation:
`validated thread-aware review snapshot -> normalized Markdown corpus and
category summary`.

## Allowed mock boundary

Checked-in sanitized fixtures are the default input. After explicit user
approval, the unmanaged read-only GitHub review-thread API may refresh missing
evidence. Do not mock normalization, fingerprint/category assignment, or count
reconciliation.

## Test command guidance

Run the focused corpus/schema reconciliation command. No product test suite is
required for docs-only records unless a validator or shared policy changes.

## Likely file ownership

- `docs/review-learning/` records for the eight PRs
- Historical category/corpus summary
- Sanitized review-thread fixture metadata when required
- Focused schema/count reconciliation tests

## Dependencies

`sequenced` after I3.

## Parallelism notes

Parallel-safe with I2 and I4 after the record schema is fixed. It does not edit
generated workflow code.

## Contract impact

Adds historical evidence only; it does not change product runtime behavior.

## Security impact

Do not access GitHub without explicit user approval. When approved, use
read-only access, retain no raw transcript, source payload, secret, or private
endpoint, and perform no replies or resolutions.

## Documentation impact

Creates the initial review-learning corpus and root-cause category summary.

## Implementation context

Use thread-aware review data rather than flat comments so resolution,
outdatedness, path, and line context are not conflated. Treat the counts above
as the approved snapshot and annotate later drift with a new observation date.

## Review expectations

Audit every count, duplicate fingerprint, category assignment, disposition,
and redaction. Confirm that later thread changes do not erase the historical
state that motivated phase 33.
