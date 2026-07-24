# ADR 0024: Versioned Review Learning and Promotion

## Status

Accepted 2026-07-24 with phase-33/001.

## Context

Review findings currently remain in provider threads or chat history, making
recurrence difficult to measure and prompting the same defect class to be
rediscovered. Committing raw transcripts would create noise and could retain
unnecessary source, secret-like values, or hidden reasoning.

## Decision

Commit one normalized `review-learning/v1` Markdown record per PR/change under
`docs/review-learning/`; keep raw transcripts local and ignored. P1/P2 block,
while each P3 receives one explicit disposition. Promote a first systemic P1
immediately, a second ordinary occurrence into a scoped review rule and
reviewer regression, and a third occurrence into a mechanical guard where
practical.

Promotions write only to human-owned manual/scoped instruction surfaces and
never silently alter compiler-generated regions.

## Rationale

Normalized records retain evidence, version, date, outcome, and recurrence
without storing full prompts or transcripts. A staged promotion threshold
keeps one-off noise out of permanent rules while turning recurring validated
failures into progressively stronger protection.

## Consequences

Positive:

- Smaller non-blocking findings remain visible and dispositioned.
- Recurring review failures become measurable and actionable.
- Rules and mechanical checks gain traceable evidence.

Negative:

- Maintainers must curate categories, fingerprints, and false-positive
  evidence.
- Records add documentation volume.
- Category drift requires schema/version discipline.
