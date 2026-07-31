# I8: Budget exhaustion must degrade to `NEEDS_CONTEXT`, not to silence

## Parent spec or request

`docs/specs/phase-33/001-change-risk-review-assurance.md`

Raised 2026-07-31 from two observed runs of the emitted reviewer, not from a
grill.

## Intent summary

A reviewer that runs out of room must still say so. Returning nothing is
strictly worse than returning an honest partial result, because the
orchestration cannot tell "the change is too large to review in one pass" from
"the reviewer emitted garbage" and retries into the same wall.

## Behavior slice

The emitted reviewer prompt states its constraints — read-only, no installs,
no network access, no repository mutation — and then says: "If required proof
cannot be obtained within these constraints, return `NEEDS_CONTEXT` with the
missing input."

The **turn budget is not named among those constraints.** The reviewer
therefore does not treat exhaustion as a `NEEDS_CONTEXT` trigger. It spends
every available turn inspecting and returns no envelope at all, which the
orchestration can only classify as an invalid attempt — consuming a transient
retry that will fail identically.

Observed twice on the same branch: at a 10-turn budget (16 tool calls, no
envelope) and again after that budget was raised to 18 (18 tool calls, no
envelope). Both produced a result only after a manual resume. The decisive
evidence is what the second run emitted once resumed: a well-formed
`NEEDS_CONTEXT` naming five specific unverified items, one of which was a real
defect nobody else had found. The capability to degrade honestly is already
there; the prompt never gives it a turn to use.

Add to the reviewer projection's result contract, and render into the prompt:

- The turn budget is one of the constraints that triggers `NEEDS_CONTEXT`.
- Reserve enough budget to emit the envelope. Emitting a `NEEDS_CONTEXT`
  envelope that names what went unverified always beats emitting nothing.
- On exhaustion, `scope.completed` is `false`, unreached domains stay
  unmarked or are reported honestly, and `missingInputs` names the specific
  checks not performed — not a generic "ran out of room".

## Non-goals

- Raising the turn budget again. That was tried and is why this brief exists;
  the previous constant and its replacement both failed the same way.
- Changing the clean-room contract, the manifest-first initial context, or the
  domain set.
- Invoking the reviewer against a bounded per-slice snapshot instead of the
  accumulated change. That is a larger contract change about how the
  orchestration composes review scope; it may still be needed, and I6 should
  measure whether this slice is sufficient before anyone proposes it.
- Detecting remaining budget programmatically. The prompt states the rule; the
  reviewer applies it.

## Acceptance criteria

- The emitted Claude and Codex reviewer artifacts name the turn budget as a
  `NEEDS_CONTEXT` constraint and state the reserve-the-envelope rule.
- Both statements are derived from the reviewer projection, not written as
  loose prose in the renderer, so they cannot drift from the result contract.
- A `NEEDS_CONTEXT` envelope produced under exhaustion still validates against
  `validateChangeRiskResultV1`: `missingInputs` non-empty, `scope.completed`
  false.
- The orchestration's existing treatment of a missing envelope as an invalid
  attempt is unchanged; this slice makes the missing envelope rarer, it does
  not reclassify it.
- Golden fixtures for both reviewer artifacts are updated in the same change.

## Expected RED proof

An emission test asserting the reviewer artifacts name the budget constraint
and the reserve rule fails against current output, which names neither.

## Expected GREEN proof

The emission test passes, both reviewer goldens carry the statements, and the
change-risk policy and orchestration suites stay green.

## Seam under test

`reviewer projection result contract -> emitted reviewer prompt`, and the
already-tested `NEEDS_CONTEXT` envelope shape under
`validateChangeRiskResultV1`.

## Allowed mock boundary

None needed. This is prompt content plus envelope validation, both directly
testable. Do not attempt to mock reviewer behaviour to "prove" the rule works;
that proves nothing about a real run, and I6's evaluation harness is where
behavioural evidence belongs.

## Test command guidance

Run the change-risk policy tests and the compiler reviewer-emission tests,
then the affected goldens, before the broader compiler suite.

## Likely file ownership

- `packages/compiler/src/change-risk-policy.ts` (reviewer projection result
  contract)
- `packages/compiler/src/compiler.ts` (`createChangeRiskReviewer`)
- Reviewer golden fixtures and their tests

## Dependencies

None blocking. Independent of I4; `parallel-safe` with it.

## Parallelism notes

Touches the reviewer projection and its goldens, which I4 does not.

## Contract impact

Extends the reviewer result contract with a degradation rule. No change to the
closed vocabularies, the envelope shape, budgets, or terminal statuses.

## Security impact

None. No new input is read and no output surface is added.

## Documentation impact

The parent spec's reviewer interface section should state the degradation rule
alongside the existing `NEEDS_CONTEXT` conditions.

## Review expectations

Confirm the rule is derived from the projection rather than hand-written into
the renderer. Check that a `NEEDS_CONTEXT` envelope emitted under exhaustion
is a valid envelope and not a special case bolted onto the validator. Push
back if the change quietly raises the turn budget as well — that is explicitly
out of scope, and bundling it would hide whether the degradation rule works.
Confirm nothing weakens the rule that a missing or malformed envelope is an
invalid attempt.
