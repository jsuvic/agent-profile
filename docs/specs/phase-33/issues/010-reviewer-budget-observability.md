# I10: The reviewer is told to ration a budget it is never given

## Parent spec or request

`docs/specs/phase-33/001-change-risk-review-assurance.md`

Raised 2026-07-31 by the change-risk reviewer's final clean-room confirmation
of the I8/I9 change (`docs/review-learning/896F5F8050686A23.md`, finding 3).

## Intent summary

I8 added a rule telling the reviewer to stop inspecting and emit
`NEEDS_CONTEXT` "when the remaining turn budget cannot cover the checks still
outstanding". The reviewer is never told what that budget is, so the rule asks
it to ration an unstated quantity.

## Behavior slice

The three projected `budgetDegradationRules` all condition on the remaining
turn budget. Where that number lives today:

- **Claude**: `maxTurns: 18` in the emitted agent's frontmatter. That is
  configuration consumed by the invoking harness, not text in the agent's
  instructions.
- **Codex**: nowhere. `renderCodexSubagent` emits only `name`, `description`,
  `sandbox_mode`, and `developer_instructions`; unlike the Claude and Tabnine
  renderers it writes no turn-budget key, so the Codex reviewer has no declared
  budget on any surface.
- **Orchestration**: the budget language in the emitted
  `subagent-driven-change` skill is the orchestrator's own fix-round and
  logical-invocation budget, not the reviewer's per-invocation turns.

The empirical case needs stating carefully, because its obvious reading is
wrong. Reviewing the I8 change itself, the reviewer returned no envelope on the
initial review and again on the final confirmation, producing a well-formed
envelope only after a manual resume each time. That looks like I8's rule
failing. It is not: those invocations ran against this repository's own
`.claude/agents/change-risk-reviewer.md`, which was stale, so the prompt in
effect was the pre-I8 one. The rule was not present to fire.

I8 is therefore UNEXERCISED, not failed. Every budget observation on record
describes the pre-change prompt. The first genuine test of the degradation rule
is whichever change is reviewed next under current artifacts — which I14 turns
from a hope into a mechanical fact. I6 must not read those runs as evidence
about I8, in either direction.

That is what makes this brief worth doing before more data arrives rather than
after: the reviewer is told to ration a quantity it is never given, so even
once the rule is genuinely in effect, nothing outside the run can distinguish
"fired", "declined to fire", and "never reached". Observability is what makes
the first real test readable.

Pick one owner for the quantity:

- Project the reviewer's declared turn budget into the emitted prompt text. It
  is already a compile-time constant (`CHANGE_RISK_REVIEWER_MAX_TURNS`), so
  this costs one interpolation and a golden update, and it fixes Codex too.
- Or add an orchestration-projection obligation that the invocation owner
  states the remaining budget in the reviewer's task context.
- Or reword the rule to a trigger that is both observable AND actually bounds
  remaining capacity. Two phrasings are already known not to qualify, and the
  acceptance criterion must reject both:
  - "More inspection than can be completed" — judging it still requires
    knowing how much budget remains, the very quantity this brief exists to
    supply.
  - A pure ordering signal, e.g. "a named category is reached with an earlier
    one unperformed" — observable, but unrelated to exhaustion. It fires
    immediately with ample turns left, making ordinary reviews incomplete, and
    if the implied order is followed it never fires at all, leaving I8's
    original failure untouched.

  A qualifying trigger has to correlate with capacity actually running out. If
  none can be stated without the number, this option is not viable and one of
  the two options that supply the budget must be chosen.

Whichever is chosen needs a compiled-artifact assertion on that surface.

## Non-goals

- Raising any turn budget. Still an explicit non-goal, for the same reason as
  in I8: it was tried twice and failed identically.
- Programmatic detection of remaining budget by the reviewer at runtime.
- Re-litigating the degradation rule's wording beyond making its trigger
  observable.

## Acceptance criteria

- The remaining or declared turn budget is observable to the reviewer on both
  the Claude and Codex surfaces, or the rule states a trigger that does not
  depend on it.
- A compiled-artifact test asserts whichever surface carries it.
- Reviewer goldens updated in the same change.

## Expected RED proof

An emission test asserting the Codex reviewer artifact makes its budget
trigger evaluable fails against current output, which names no budget at all.

## Seam under test

`reviewer projection -> emitted reviewer artifact`, on both targets.

## Dependencies

Depends on nothing. Overlaps I6, which owns measuring whether the I8 prompt
rule is sufficient in practice; I6 should read this brief before concluding.

## Contract impact

Assigns an owner to a quantity the current rule assumes. No change to the
envelope, the validator, closed vocabularies, or budgets themselves.

## Security impact

None.

## Review expectations

Push back if the change raises a budget constant. Confirm the Codex surface is
actually covered rather than only Claude — the asymmetry between the two
renderers is the substance of this brief.
