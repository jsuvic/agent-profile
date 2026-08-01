# I12: The ledger-write obligation is unsatisfiable under the snapshot rule

## Parent spec or request

`docs/specs/phase-33/001-change-risk-review-assurance.md`

Raised 2026-07-31 while completing phase-33 I8/I9
(`docs/review-learning/896F5F8050686A23.md`). This is a contract conflict, not
a defect in that change.

## Intent summary

The workflow requires bookkeeping writes after orchestration reaches a terminal
status, and separately declares that any change to the snapshot outside
`docs/review-learning/` invalidates the preceding clean result. Every change
that follows this repository's own documentation practice therefore violates
one rule or the other.

## Behavior slice

Two obligations that cannot both be met:

1. Persist the learning record when orchestration reaches a terminal status,
   and apply the promotion table to each validated finding. In this repository
   that also means a follow-up issue brief for each out-of-scope finding and a
   ledger row so it is dispatchable, plus flipping the reviewed slice's own
   `TASKS.md` status to `done`.
2. `docs/review-learning/` is the _only_ prefix excluded from snapshot
   identity. Anything else — `TASKS.md`, `docs/specs/**/issues/*.md`, a phase
   `README.md` — moves the snapshot past the one the terminal result certifies.

Observed on the I8/I9 change: terminal CLEAN was reached at snapshot
`896F5F8050686A23`; writing the record was fine, but the two follow-up briefs,
the ledger rows, and the phase README index left the tree no longer matching
the confirmed snapshot. The three available responses were all bad:

- Accept it as a judgement call — the first exception to a deliberately
  mechanical rule, on the first occasion it bites, which is how a guard becomes
  advisory.
- Re-confirm — spends a bounded confirmation invocation to buy a state that
  dies at the next ledger edit.
- Split the bookkeeping into a separate change — what was done, and it works,
  but it means every future change carries a second commit of pure bookkeeping
  and the same three-way decision recurs every time.

The workaround must not become the habit; that is why this is filed.

## Options for the grill

- Widen the snapshot exclusion to cover the ledger and issue briefs alongside
  `docs/review-learning/`, on the grounds that none of them is reviewable
  product content and none can change compiled output.
- Or sequence ledger and brief writes _before_ the final clean-room
  confirmation, so the confirmed snapshot already contains them.
- Or state explicitly that bookkeeping belongs in a separate change and make
  that the documented, expected shape rather than a workaround.

Each changes an approved contract, which is why this is a grill decision rather
than an implementation slice.

## Constraint on the widening option

If the exclusion is widened, it must NOT cover `docs/specs/**/issues/*.md`.
Issue briefs are executable workflow inputs: `implement-next` loads the linked
brief as the implementation contract. Excluding them would let a brief be added
or altered after terminal review without invalidating the handoff, and a later
agent would implement requirements that were never reviewed — a strictly worse
hole than the one this brief closes. Compiled-output boundary fixtures do not
mitigate it, because the brief is consumed as instructions rather than compiled.

`TASKS.md` is not inert either, and must not be excluded by path. The
generated `implement-next` flow reads task order, state, and brief links from
it and selects the first `ready` row, so a post-review status, ordering, or
link edit changes which contract the next agent implements. This is not
hypothetical: the previous review round on this branch found a `human-gate`
row ordered above four `ready` rows, which made those rows undispatchable —
ledger order is executable.

So a path-level widening has almost nothing left to cover: briefs are
executable, the ledger is executable, and what remains is a phase README
index. Any exclusion must therefore be defined by what it provably permits —
inert additions that no generated skill reads as an instruction — rather than
by naming a file. If that cannot be defined crisply, the honest resolutions
are the other two: sequence bookkeeping writes before the final confirmation,
or make the two-commit split the documented shape.

## Non-goals

- Weakening the rule that a code change invalidates a preceding clean result.
  The problem is the scope of the exclusion, not the invalidation rule.
- Excluding anything that can affect compiled artifacts or tests.

## Acceptance criteria

- The chosen option is recorded as an amendment to the parent spec.
- The `subagent-driven-change` projection and the emitted skill agree with it.
- A worked example shows a change with an out-of-scope finding reaching
  terminal status, persisting its record, filing a brief with a ledger row, and
  ending in a self-consistent state.
- If the exclusion widens, boundary fixtures cover the newly excluded paths and
  their non-excluded neighbours, per the existing determinism requirement for
  high-risk classification.

## Contract impact

Changes snapshot-identity scope or the ordering of a required confirmation.
Both are versioned contracts: incrementing the workflow-policy version is
likely required.

## Security impact

None directly. Widening an exclusion must not admit any path that can change
compiled output, which is what the boundary fixtures are for.

## Review expectations

Push back on any option that lets a path capable of altering compiled artifacts
into the exclusion. Confirm the emitted skill and the spec cannot disagree
about which prefixes are excluded.
