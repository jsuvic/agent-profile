# I6: Validate the published review workflow

## Parent spec or request

`docs/specs/phase-33/001-change-risk-review-assurance.md`

## Intent summary

Prove that the packed product emits a coherent reviewer workflow and that the
prompt discovers representative historical defect classes without being
given the expected answer.

## Behavior slice

Compile and inspect the qualifying workflow through the packed published seam,
verify every reviewer/orchestration/record/promotion artifact and reference,
then forward-evaluate the generated reviewer on a local sanitized historical
corpus. Each evaluation uses a fresh reviewer, raw task artifacts, and no
expected finding list or prior conclusions.

## Non-goals

- Claiming parity with a hosted provider's private reviewer.
- Turning nondeterministic model evaluation into a network-required unit test.
- Uploading source or requiring GitHub during the published journey.
- Expanding the historical backfill.

## Acceptance criteria

- The packed product emits the same reviewer and orchestration contracts as
  source-tree goldens for qualifying Codex and Claude profiles.
- Negative pack combinations have no dangling reviewer or skill references.
- Published artifacts contain the exact policy versions, closed statuses,
  retry limits, dispositions, and ownership rules.
- The local forward-evaluation corpus covers every approved root-cause
  category with at least one representative case.
- Every seeded P1 category is recovered in at least one of at most two
  clean-room evaluation runs.
- Evaluation inputs do not expose expected findings, suspected fixes, prior
  conclusions, or implementer praise.
- Misses, variability, and residual risk are recorded and feed I4 rather than
  being silently accepted.
- Full required validation from the parent spec completes or reports exact
  unrelated/pre-existing failures.

## Expected RED proof

A packed-journey assertion fails because the published artifacts do not yet
contain the reviewer and integrated policy; a fresh-reviewer baseline records
the current missed categories.

## Expected GREEN proof

Packed assertions, no-dangling-reference checks, full validation, and the
forward-evaluation evidence matrix satisfy the acceptance criteria.

## Seam under test

Published deterministic generator:
`packed agent-profile compile -> emitted reviewer/workflow artifacts`, plus a
human-reviewed local evaluation seam:
`raw sanitized change artifact -> prioritized reviewer findings`.

## Allowed mock boundary

Packed filesystem isolation and unmanaged model invocation may use the
existing test/evaluation harness. Do not mock compiler output, skill content,
or expected reviewer findings into the prompt.

## Test command guidance

Run the focused packed journey, affected workspace tests and goldens, then
full `npm test`, `npm run check`, `npm run doctor`, and
`npm run verify:pack`.

## Likely file ownership

- Published-journey test under `scripts/release/`
- Qualifying profile and expected packed artifacts
- Local sanitized forward-evaluation corpus and evidence matrix
- Any final fixture/doc corrections required for parity

## Dependencies

`sequenced` after I1-I4. I5 is not a merge prerequisite but its completed
corpus may expand the evaluation evidence.

## Parallelism notes

Final integration slice; do not run in parallel with unresolved I1-I4 changes
to shared workflow artifacts.

## Contract impact

No new behavior beyond I1-I4; this slice verifies the actual published seam
and closes phase acceptance evidence.

## Security impact

Evaluation is local and source-free from external services. Runtime sentinels
must prevent unexpected network/process activity in the packed journey.

## Documentation impact

Add the forward-evaluation evidence matrix, final spec-to-test matrix, and
remaining-risk statement.

## Implementation context

Follow skill forward-testing discipline: use fresh reviewers, pass raw
artifacts rather than diagnoses, and avoid artifacts that leak expected
answers between runs. Keep nondeterministic evaluation separate from
deterministic build/test gates.

## Review expectations

Verify the packed dependency graph and actual emitted files, not source-tree
approximations. Audit the evaluation for answer leakage, anchoring, hidden
network use, and selective reporting of successful runs.
