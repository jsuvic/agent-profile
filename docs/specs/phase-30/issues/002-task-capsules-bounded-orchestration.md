# I2: Task capsules and bounded orchestration

## Parent spec or request

`docs/specs/phase-30/001-role-aware-indexed-subagents.md`

## Intent summary

Reduce delegated context without losing correctness by sending one isolated,
authoritative task capsule and enforcing the approved subagent topology.

## Behavior slice

Generated workflow guidance constructs a bounded task capsule, applies the
context-precedence rule, uses targeted memory only, enforces depth 1/thread cap
3/no parallel writes, and keeps implementation -> spec review -> quality review
sequential.

## Non-goals

- Indexed-context readiness detection.
- Exact client model mapping (I1).
- Persisted evidence trace (I5).

## Acceptance criteria

Phase-30 acceptance criteria 3 and 5.

## Expected RED proof

Workflow goldens currently allow broad fresh context and have no capsule-field,
depth, concurrency, or parallel-write contract.

## Expected GREEN proof

Goldens and orchestration tests prove the capsule field set, precedence,
targeted-memory rule, bounded topology, and sequential reviews.

## Seam under test

`approved issue brief + execution policy -> delegated task and review sequence`.

## Allowed mock boundary

The client subagent dispatch interface only; assert dispatched inputs and order,
not internal model behavior.

## Test command guidance

Run focused skill-content/selection tests and target goldens, then full tests.

## Likely file ownership

- Canonical subagent/workflow skill content and templates
- Skill-selection/orchestration policy helpers
- Codex/Claude/Tabnine goldens and workflow docs

## Dependencies

I1 canonical policy and role matrix.

## Parallelism notes

Mutually parallel-safe with I3 after I1 at the behavior level. Coordinate
shared skill/golden files; no parallel writes.

## Contract impact

Amends existing phase-13 subagent template contracts only for enabled policy;
fresh context becomes the explicit task capsule rather than hidden chat state.

## Security impact

Capsule construction must exclude secrets, unrelated chat, raw memory dumps,
and content outside the approved task scope.

## Documentation impact

Workflow lifecycle, role matrix, capsule definition, context precedence, and
bounded-parallelism guidance.

## Implementation context

Required capsule fields: objective, authoritative artifact paths, contracts and
non-goals, seam/mock boundary, validation commands, write ownership, blockers.
Do not add fields merely because the current conversation contains them.

## Review expectations

Use sentinels for full-history leakage, recursive delegation, fourth concurrent
thread, parallel write dispatch, review reordering, and unrelated memory.
