# I3: Persist versioned review-learning records

## Parent spec or request

`docs/specs/phase-33/001-change-risk-review-assurance.md`

## Intent summary

Keep durable, comparable evidence for blocking and smaller findings without
committing raw prompts or transcripts.

## Behavior slice

Define `review-learning/v1`, add a concise normalized Markdown template under
`docs/review-learning/`, and update generated workflow instructions to create
one record per reviewed PR/change. Records include version/date/snapshot,
reviewer surface, attempt counts, round outcomes, fingerprints, evidence,
closed resolution, conditional P3 disposition, and terminal status. Every
record carries a closed `sourcePolicy` naming the producing orchestration:
`change-risk/v1` for runs this workflow executed (with required
invocation/attempt counts), or `legacy-external` only when the entire
record's orchestration was outside this workflow — historical backfill or an
external-only review. A local run that incorporates a validated external
finding remains a `change-risk/v1` record and keeps its local counters; the
external contribution is marked per-round/per-finding with the parent
`source: local | external` markers, never by downgrading the record's
`sourcePolicy`. Raw review material is explicitly local and ignored.

The record schema consumes the closed values and learning-record projection
of the shared policy source established by I1; it does not duplicate those
constants. Generated workflow instructions follow the parent learning-record
context-isolation contract: historical records feed promotion and evaluation
only and are never loaded wholesale into clean-room reviewer context.

## Non-goals

- Storing hidden reasoning, raw prompts, full diffs, or tool transcripts.
- Hosted analytics or a new telemetry command.
- Automatically publishing records outside the repository.
- Backfilling historical PRs; I5 owns that work.

## Acceptance criteria

- The template contains every `review-learning/v1` required field and closed
  value from the parent spec.
- Unknown provider/model versions use `unknown`.
- Every P3 row requires exactly one allowed disposition.
- P1/P2 rows omit disposition; every priority uses one allowed resolution.
- False positives require invalidating evidence.
- Raw transcript/diff/secret-shaped content is explicitly excluded from the
  committed record.
- Generated skills reference the normalized record, not an implementation
  report or free-form diary.
- Fixtures cover clean, no-progress, and needs-human-review, plus both
  `sourcePolicy` values with their conditional execution fields.
- Closed values come from the I1 shared policy source's learning-record
  projection; no duplicated constants.
- Generated skills exclude historical records, recurrence counts, and prior
  conclusions from initial/final clean-room reviewer context.

## Expected RED proof

A schema fixture test fails because no review-learning template or required
record contract exists.

## Expected GREEN proof

All valid record fixtures pass, malformed closed values or missing required
fields fail, and generated skill goldens point to the versioned format.

## Seam under test

Deterministic record contract:
`normalized review result -> review-learning Markdown`, plus generated skill
output that instructs the same schema.

## Allowed mock boundary

Clock and reviewer-version discovery may use fixed input values. Do not mock
record validation or rendering.

## Test command guidance

Run focused record-schema/template tests and affected compiler goldens before
the broader compiler suite.

## Likely file ownership

- New `docs/review-learning/README.md` and template/example
- Focused record schema/validator or deterministic fixture helper
- `packages/compiler/src/compiler.ts` workflow skill rendering
- Review-learning fixtures and tests

## Dependencies

`sequenced` after I1, which owns the shared policy source and its
learning-record projection.

## Parallelism notes

Own record/template files and record-related skill sections only.

## Contract impact

Adds a committed review-evidence artifact maintained by the workflow, not an
APC-generated or lockfile-owned project file.

## Security impact

The record stores minimal normalized evidence and redacts secret-like values.
Raw transcripts stay outside version control; no source or secret upload.

## Documentation impact

Create the review-learning schema/template documentation and add the glossary
terms from phase 33.

## Implementation context

Follow the phase-24 ownership model: APC instructs agents to maintain runtime
workflow artifacts but does not generate, lockfile-track, or execute them.
Use a stable human-readable fingerprint rather than hashing free-form reviewer
prose.

## Review expectations

Try malformed dates, missing versions, unknown reviewer surfaces, duplicate
fingerprints, invalid dispositions, and evidence containing secret-shaped
values. Confirm records remain concise enough to review in a PR.
