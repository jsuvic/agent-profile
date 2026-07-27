# I2: Orchestrate bounded review remediation

## Parent spec or request

`docs/specs/phase-33/001-change-risk-review-assurance.md`

## Intent summary

Run the new reviewer after existing gates, allow enough complete-change passes
to discover follow-on defects, and stop predictably when fixes do not
converge.

## Behavior slice

Update generated `subagent-driven-change`, `implement-next`, and
`final-review` instructions with one ownership split:

- `subagent-driven-change` owns the full orchestration state machine and is
  the only surface that invokes the change-risk reviewer, after spec and
  code-quality review.
- `implement-next` initiates or resumes the orchestration and reports its
  current state. It does not redefine budgets or transitions and does not
  invoke another review.
- `final-review` verifies that an allowed terminal state exists for the final
  snapshot. It does not reimplement the review loop or re-review an
  unchanged snapshot.

The owning surface tracks logical invocations, transient attempts, snapshots,
fingerprints, blocker counts, fix rounds, budget reservation for required
confirmation, clean-result invalidation, required confirmation,
result-envelope validity, terminal-trigger precedence, and terminal
escalation using `change-risk/v1`.

## Non-goals

- Implementing product runtime telemetry or a hosted orchestration service.
- Automatically fixing P3 findings.
- Making GitHub review mandatory.
- Allowing the reviewer to write code.

## Acceptance criteria

- Pipeline order matches the parent spec.
- Exactly one generated surface (`subagent-driven-change`) owns the complete
  change-risk state machine. Other surfaces reference that owner and state
  only their local entry, handoff, or terminal-verification
  responsibilities; nested surfaces never trigger a second review of the
  same unchanged snapshot.
- Closed counts and transition rules are not independently reproduced in
  multiple generated skill bodies.
- Contract tests fail when two surfaces independently define the same retry,
  round, confirmation, or escalation value.
- Initial review, remediation review, and final clean-room confirmation use
  their distinct context rules.
- The state machine permits at most three fix rounds, six completed logical
  reviews, and two transient retries per logical invocation, and reserves
  budget so a fix round never starts without room for its remediation review
  plus any then-required final confirmation.
- Same-fingerprint recurrence, blocker-count stagnation, unchanged snapshots,
  the unchanged-snapshot exception for required final confirmation,
  dispositioned P3-only terminal clean, overlapping terminal-trigger
  precedence (`NEEDS_HUMAN_REVIEW` over `NO_PROGRESS`), exhausted attempt
  retries, remaining blockers, confirmation triggers, invalid result
  envelopes, and code-after-clean transitions produce the exact required
  outcome.
- `NEEDS_CONTEXT` or invalid/empty/truncated/mismatched output retries within
  the per-invocation cap and can never transition to clean.
- P1/P2 block; P3 requires one allowed disposition.
- A validated external P1/P2 reopens the loop only within the remaining local
  budget.

## Expected RED proof

A table-driven orchestration-policy test fails on at least the fourth fix
round, same-fingerprint recurrence, and code-after-clean cases because the
current workflow has no such state machine.

## Expected GREEN proof

Every transition table row and all changed generated skill goldens pass with
consistent counts, statuses, and context rules.

## Seam under test

Orchestration policy:
`review state + review result + snapshot -> next action/status`, plus
`compile(profile) -> emitted orchestration skills`.

## Allowed mock boundary

Only an unmanaged reviewer/tool invocation may be represented by deterministic
result fixtures. Do not mock the transition logic or generated skill renderer.

## Test command guidance

Run the focused policy transition tests, then compiler golden tests and the
affected workflow-selection suite.

## Likely file ownership

- Shared review-policy/state module established by I1
- `packages/compiler/src/compiler.ts` workflow skill rendering
- `packages/compiler/src/skill-selection.ts` if dependencies change
- Subagent-driven and code-review fixtures for Codex and Claude

## Dependencies

`sequenced` after I1.

## Parallelism notes

Can proceed in parallel with I5 after I1 and I3 land; it does not own
historical records.

## Contract impact

Changes the generated completion contract: implementation handoff now requires
the risk-review state machine to reach an allowed terminal result.

## Security impact

No automatic permission broadening, external invocation, commit, push, or
review-thread mutation. Budget exhaustion escalates rather than self-approves.

## Documentation impact

Update generated workflow docs and phase-33 dependency/status notes.

## Implementation context

Count logical reviews separately from transient attempts. A remediation review
may receive prior fingerprints to verify closure; initial and final clean-room
reviews must not. Review the whole updated snapshot after each fix batch, not
only the last patch.

## Review expectations

Build a transition matrix for every limit and terminal state. Look for
off-by-one errors, retries that bypass total budgets, invalid output that
self-approves, redundant unchanged remediation reviews, required unchanged
confirmation being skipped, and code changes that fail to invalidate clean
status.
