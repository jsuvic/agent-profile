# I2: Grill + synthesis content - Design-it-Twice, Seam & Interface Design, ledger/brief/glossary/ADR writes

## Parent spec or request

`docs/specs/phase-24/001-workflow-upgrade-skills.md`

## Intent summary

Architecture and seam decisions move to grill/synthesis where the human gate
already exists (D2, D4, D6).

## Behavior slice

Emitted `grill-change` gains the Design-it-Twice question form (two genuinely
different paths with interfaces, risks, and a recommendation for
hard-to-reverse choices) plus ADR-candidate capture, while staying read-only.

Emitted `request-to-spec-issues` gains:

- A Seam & Interface Design section: 3-way slice classification
  (computation / orchestration / deterministic generator), the
  highest-fast-deterministic seam rule with existing seams preferred,
  mock-boundary declaration (unmanaged dependencies only), the sizing rule
  (one slice = one seam = one observable outcome = one RED), and the
  5-question human-gate checklist (boundary placement, black-box, I/O via
  explicit interface, glossary naming, abstraction-only-for-the-test).
- Brief fields `Seam under test` and `Allowed mock boundary`.
- A single approved write step covering: `TASKS.md` (index-only ledger with
  the closed state set), `docs/specs/<spec-dir>/issues/NNN-slug.md` briefs,
  `CONTEXT.md` (glossary-only, lazy creation, definitions of at most two
  sentences, `Avoid:` lines), and ADRs (existing project ADR directory if
  present, else `docs/adr/`; three-criteria threshold: hard to reverse,
  surprising without context, real trade-offs).

## Non-goals

- TDD-side enforcement (I3).
- `implement-next` (I4).
- Doctor checks (I5).

## Acceptance criteria

Spec acceptance criterion 2.

## Expected RED proof

Golden assertions for the new sections and brief fields fail against the
current skill bodies.

## Expected GREEN proof

Updated goldens pass; the grill safety section still forbids writes during
the grill.

## Seam under test

`compile(profile) -> emitted skill bodies` via golden fixtures.

## Allowed mock boundary

None.

## Test command guidance

Compiler workspace tests plus the golden suite via `npm run test`.

## Likely file ownership

- Skill body source for the two skills (locate in
  `packages/compiler/src/phase12-skill-content.ts` /
  `packages/compiler/src/guidance-content.ts`)
- Golden fixtures

## Dependencies

None - `ready`.

## Parallelism notes

Content-file overlap with I1/I3; logically independent. Recommended merge
order: I2 first.

## Contract impact

Brief format extension (additive); the ledger state set becomes a documented
contract.

## Security impact

Write instructions must route through client approval; no GitHub issues;
verify wording keeps the grill read-only.

## Documentation impact

Phase-24 README. `SPEC_TEMPLATE.md` untouched (TDD Strategy remains
complementary to Tests).

## Implementation context

Checklist wording per the agreement record: first row is "highest fast
deterministic boundary" (not "use-case layer"), fifth question is "does an
abstraction exist only for the test?". CONTEXT.md stays a glossary only -
no implementation details or decisions.

## Review expectations

Compare emitted text against decisions D2/D4/D6 verbatim; no schema changes.
