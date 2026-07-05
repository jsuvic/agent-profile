# I4: implement-next skill + emission rule

## Parent spec or request

`docs/specs/phase-24/001-workflow-upgrade-skills.md`

## Intent summary

One human command dispatches exactly one ready task with full persisted
context (D3, D7, D8, D9).

## Behavior slice

New generated skill `implement-next`:

1. Read `TASKS.md`; take the first `ready` entry. Halt at `human-gate` with
   an explanation; skip `blocked` / `sequenced`.
2. Mark it `in-progress` (client write approval).
3. Load the linked issue brief and run `subagent-driven-change`
   (implementer -> spec-reviewer -> code-quality-reviewer) with the brief as
   Fresh Context.
4. After reviews pass and tests run, mark the task `done` and stop - the
   next task requires a new invocation.

Unified failure path (implementer `BLOCKED`/`NEEDS_CONTEXT`, unrecoverable
review findings, GREEN unreachable within brief scope): mark the task
`blocked` with a one-line reason (for the seam escape hatch, include why the
seam failed), stop, never touch the next task or edit the brief. The human
decides (edit brief, re-grill, split) and flips the state back to `ready`.

Emission rule: emitted iff `request-to-spec-issues` and
`subagent-driven-change` are emitted for that target and the subagent chain
is `confirmed-official` in the capability matrix; otherwise an informational
not-supported note, never silence. Added to the I1 flag policy table as an
entry point (`disable-model-invocation: true` where supported).

## Non-goals

- Iteration (WS6 loop skill territory).
- Parallel-run locking of the ledger (recorded risk, future extension).

## Acceptance criteria

- Spec acceptance criterion 4.
- Emission-rule unit tests across pack combinations.

## Expected RED proof

A `skill-selection.test.ts` case asserting `implement-next` is in the
selected set for a qualifying combination fails.

## Expected GREEN proof

Emission tests pass including negative combinations; the golden fixture for
the skill body passes.

## Seam under test

`skill-selection` pure functions (emission rule) plus
`compile(profile) -> emitted skill body` via golden fixtures.

## Allowed mock boundary

None.

## Test command guidance

`skill-selection.test.ts` first, then the golden suite, via `npm run test`.

## Likely file ownership

- `packages/compiler/src/skill-selection.ts`
- New body content module (or extension of an existing content module)
- Golden fixtures
- Capability matrix research note

## Dependencies

`sequenced` after I1 (flag table) and I2 (brief/ledger format it consumes).

## Parallelism notes

Must not merge before I2's format lands.

## Contract impact

New skill id in the closed set; conditional-pointer rule extended; no
dangling references in any pack combination.

## Security impact

Highest of the set: verify stop-and-report wording, no self-approval, no
brief edits, no multi-task continuation.

## Documentation impact

Phase-24 README; capability matrix (Codex subagent support).

## Implementation context

Reuse the WS6 not-supported-note pattern verbatim for missing-capability
targets.

## Review expectations

Adversarial read of the failure-path text against D7; dangling-reference
sweep across pack combinations.
