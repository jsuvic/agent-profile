# I2: Integrate the bounded loop and ledger gate

## Parent spec or request

`docs/specs/phase-34/001-bounded-spec-review.md`

## Intent summary

Run the spec reviewer after synthesis persistence, converge or escalate on
closed rules, and keep implementation slices non-dispatchable until the loop
approves the spec set.

## Behavior slice

Update the generated grill/synthesis workflow instructions to own the
bounded loop: initial review, at most two amendment-plus-revision rounds,
transient retries, the zero-P1 stop rule, residual-disposition recording,
non-progress and budget escalation to `needs-grill`, and the ledger gate
that opens implementation slices only on `approved-for-implementation`.
Amendments update every affected document copy in the same round. The
terminal result persists as a `review-learning/v1` record with
`sourcePolicy: spec-review/v1`.

## Non-goals

- Letting the reviewer author amendments or edit the agreement record.
- Reviewing implementation snapshots.
- Blocking termination on dispositioned P2/P3 findings.

## Acceptance criteria

- Exactly one generated surface owns the loop state; wrappers verify or
  propagate its terminal result.
- The state machine enforces the three-logical-review budget, one amendment
  round per revision, stop rule, both non-progress rules, and both terminal
  statuses with no conflicting counts.
- `needs-grill` returns open findings to the human and never overrides an
  agreement-record decision; an explicit human acceptance is recorded.
- Implementation slices of the reviewed set stay non-dispatchable until the
  terminal record exists; the gate is tested.
- `defer-to-implementation` dispositions name their closing artifact and are
  surfaced to the affected slice's brief or dispatch context.

## Expected RED proof

A table-driven loop test fails on the fourth-review, non-progress, and
gate-bypass cases because no such state machine exists.

## Expected GREEN proof

Every transition row and all changed generated skill goldens pass.

## Seam under test

Orchestration policy: `loop state + review result -> next action/status`,
plus `compile(profile) -> emitted workflow skills`.

## Allowed mock boundary

Reviewer invocations may be represented by deterministic result fixtures.
Do not mock transition logic or renderers.

## Likely file ownership

- Shared policy source (spec-review projection from I1)
- Generated grill/synthesis workflow skill rendering
- Ledger-gate rendering and fixtures
- Loop transition tests and goldens

## Dependencies

`sequenced` after I1.

## Contract impact

Changes the synthesis completion contract: persistence alone no longer makes
implementation slices dispatchable.

## Security impact

No permission broadening; escalation goes to the human, never to
self-approval.

## Review expectations

Probe off-by-one round counting, gate bypass via direct ledger edits,
amendments that skip a document copy, and stop-rule evaluation before
residual dispositions are recorded.
