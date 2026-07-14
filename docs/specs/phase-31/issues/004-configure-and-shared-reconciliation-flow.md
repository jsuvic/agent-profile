# I4: State-aware configure and atomic shared reconciliation

## Parent spec or request

`docs/specs/phase-31/001-permission-posture-lifecycle.md`

## Intent summary

Let users change or reconcile declared posture through one understandable
interactive flow without guessing commands or risking partial shared writes.

## Behavior slice

`agent-profile configure` shows current posture, alternatives, per-client
outcomes, hard denials, and mapping status; supports repair/adopt/review/leave;
previews profile/generated changes plus any explicitly selected `.gitignore`
prerequisite for later personal activation; and applies shared changes
atomically.

## Non-goals

- Personal activation writes (I5).
- Bare-dispatcher routing (I7).
- Non-interactive posture adoption.

## Acceptance criteria

- Phase-31 acceptance criteria 3-4, 9-10, limited to shared flow.
- Current posture is preselected; cancel/default leave all bytes unchanged.
- Legacy Autonomous offers keep, explicit Trusted-local migration, other
  posture, and cancel with no silent reinterpretation.
- Per-client outcomes and mapping statuses come from I2's versioned mapping
  report rather than configure-owned mapping logic.
- An explicitly selected `.gitignore` prerequisite is part of the shared
  preview and atomic transaction; cancel or failure leaves it unchanged.
- Unrepresentable adoption is refused with stable redacted guidance.

## Expected RED proof

The command/flow does not exist; legacy and reconciliation fixture matrices
cannot reach a shared preview or atomic apply.

## Expected GREEN proof

All choice/preview/cancel/refusal/write-failure rows pass; shared profile,
generated artifacts, and any selected ignore prerequisite commit together or
remain untouched.

## Seam under test

`runConfigurePermissionFlow(repoState, injectedPrompts) -> report + shared filesystem effect`.

## Allowed mock boundary

Injected prompts/streams and temporary filesystem only. Use real posture
resolver, inspection model, compile planner, and atomic writer.

## Test command guidance

Run focused CLI configure tests, shared planner/write sentinels, compiler
goldens, then full CLI tests, check, lint, verify:pack, and package dry-run.

## Likely file ownership

- CLI command routing and clack presenter
- Shared configure/reconciliation orchestrator
- Existing profile insertion/editor and compile-plan integration
- `.gitignore` classification/insertion through the shared planner
- CLI docs/help and flow fixtures

## Dependencies

`sequenced` after I1, I2, and I3; consumes I2's versioned mapping report.

## Parallelism notes

Owns CLI configure flow and shared write transaction. Do not overlap I7 CLI
dispatcher touchpoints without coordination.

## Contract impact

Adds `agent-profile configure` as an interactive explicit command. Frozen
non-interactive commands and existing compile reconciliation remain unchanged.

## Security impact

Read-only until preview/confirmation; any selected ignore prerequisite is an
explicit shared mutation in the same atomic transaction; no secret reads,
network, client execution, dependency install, or implicit posture change.

## Documentation impact

CLI reference, migration guide, screenshots/text examples, refusal recovery.

## Implementation context

Reuse existing clack cancellation and compile/profile planning seams. Keep
`index.ts` thin and keep permission decisions in the canonical modules.

## Review expectations

Audit every mutation for preview, separate consent, rollback, cancellation,
exit code, redaction, and legacy byte preservation.
