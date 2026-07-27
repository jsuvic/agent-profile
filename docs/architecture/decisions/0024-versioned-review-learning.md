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
while each P3 receives one explicit disposition and P1/P2 omit disposition.
Every record carries a closed `sourcePolicy`: `change-risk/v1` for reviews
this workflow executed, or `legacy-external` for historical/external reviews,
which omit the execution-count fields instead of fabricating provenance.
Promotion recurrence is keyed on a closed canonical category identity with
alias normalization. Promote a first systemic P1 immediately, record and
categorize a first non-systemic P1 and first ordinary P2/P3, promote a second
occurrence into a scoped review rule and reviewer regression, and a third
occurrence into a mechanical guard where practical. Promoted rules carry
lifecycle status (`active | superseded | retired`); a rule made redundant by a
deterministic guard is retired and no longer rendered into generated context.
Historical records are evaluation and promotion evidence only and are never
loaded into clean-room reviewer context.

Within the reviewed change, promotion writes only proposed-patch artifacts
under `docs/review-learning/proposals/`; applying a proposal to a
human-owned manual/scoped instruction surface is a separate later reviewed
change through the normal write boundary. Promotion never silently alters
compiler-generated regions.

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
