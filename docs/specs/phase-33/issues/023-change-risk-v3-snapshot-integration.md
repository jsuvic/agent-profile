# I23: Bind change-risk/v3 to CLI review snapshots

## Parent spec or request

`docs/specs/phase-33/004-cli-owned-review-provenance-amendment.md`

## Intent summary

Close the caller-minted snapshot gap in the existing change-risk axis by
requiring I22 handles throughout invocation, remediation, resume, learning,
and final validation.

## Behavior slice

Advance the change-risk workflow to `change-risk/v3`. Generated orchestration
builds or receives one CLI snapshot handle, reviewers access it through CLI
commands, result/handoff validation binds to it, and every snapshot-changing
fix constructs a new handle. Active v2 state cannot resume as v3 and must
restart from a fresh build with fresh counters.

## Non-goals

- Spec-conformance integration; resumed I20 owns it.
- Changing priorities, categories, clustering, promotion thresholds, review
  budgets, or learning schema version.
- Migrating/adopting a v2 snapshot ID.
- Combining change-risk and Spec findings.

## Acceptance criteria

- Shared policy source and every change-risk projection emit
  `change-risk/v3` and reference `review-snapshot/v1`/I22 commands.
- A caller-minted string cannot start orchestration, validate `CLEAN`, satisfy
  handoff snapshot matching, or enter a learning record as a v3 review.
- The preserved executable probe `caller-minted-snapshot` becomes a focused
  regression test against the real CLI-handle path.
- Initial, remediation, confirmation, resume, external-finding, final-review,
  and learning-record consumers carry the same validated handle identity.
- A fix changing any reviewed byte requires a newly built handle; unchanged
  metadata-only review-learning paths retain the approved exclusion.
- v2 active state/result resume is refused and rerun through a new handle with
  fresh counters; historical records remain unchanged.
- Generated Codex/Claude artifacts have no raw-ID/descriptor fallback and keep
  clean-room context isolation.
- Existing budgets, priorities, clustering, promotion, and result separation
  remain byte/behavior compatible apart from the version/snapshot seam.

## Expected RED proof

The current exported validators accept `caller-minted-snapshot` as a valid
clean result and orchestration state without any CLI handle.

## Expected GREEN proof

The same probe is refused; a real I22 handle completes initial/remediation/
confirmation state transitions and persists the exact v3 identity.

## Seam under test

Orchestration seam: change-risk state-machine events using a real CLI handle ->
validated snapshot-bound handoff and generated workflow behavior.

## Allowed mock boundary

External hosted reviewer only, using sanitized findings. Do not mock I21/I22,
the change-risk validator/orchestrator, generated workflows, or snapshot
identity transitions.

## Test command guidance

Run focused policy/orchestration v3 tests, generated workflow goldens, review-
learning tests, then compiler checks, artifact guard, and pack verification.

## Likely file ownership

- Change-risk policy/orchestration/learning compiler modules and tests
- Canonical subagent-driven-change/final-review/implement-next content sources
- Generated Codex/Claude reviewer/workflow artifacts and goldens
- Pack fixtures and Phase 33 docs

## Dependencies

Sequenced after I22. Parallel-safe with resumed I20 apart from generated
workflow/artifact fixtures; coordinate regeneration and merge order.

## Parallelism notes

Prefer I20 first when both touch `subagent-driven-change`, then rebase and
regenerate I23 once. I24 waits for both.

## Contract impact

Advances `change-risk/v2` to v3 and changes the snapshot-bound handoff input.
No learning schema, role ID, or profile schema change.

## Security impact

Removes raw caller snapshot authorization. Preserves local-only/no-upload and
documents the residual hostile-local-controller boundary.

## Documentation impact

Update workflow-policy version tables, active-state migration guidance, CLI
snapshot instructions, and change-risk architecture docs.

## Implementation context

The current validator accepts any non-empty snapshot string. Fix every
producer and consumer class, not only `validateChangeRiskResultV1`.

## Review expectations

Trace the handle through every reachable state/record consumer. Require
runtime proof that v2 cannot be relabelled and v3 cannot fall back to raw IDs.
