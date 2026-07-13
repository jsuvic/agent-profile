# I6: Automatic post-grill synthesis and persistence authorization

## Parent spec or request

`docs/specs/phase-24/001-workflow-upgrade-skills.md`, amendment approved
2026-07-13 (ADR 0018).

## Intent summary

Treat approval of the completed grill agreement as approval of its faithful
derived synthesis, removing a redundant human gate while preserving a stop for
new or unresolved decisions.

## Behavior slice

The emitted `grill-change` hands an approved agreement record directly to
`request-to-spec-issues`. The latter synthesizes and persists the bounded local
artifacts without requesting a second product-level approval. It stops before
writes on contradiction, missing material decision, or scope expansion.

## Non-goals

- Bypassing client filesystem permission controls.
- Persisting before the grill agreement is approved.
- Automatically implementing any synthesized issue.

## Acceptance criteria

Phase-24 acceptance criterion 7.

## Expected RED proof

Current skill goldens require a separate synthesis review/approval and do not
encode automatic handoff or the derivation-exception stop.

## Expected GREEN proof

Updated goldens show automatic handoff, one bounded persistence authorization,
and stop-before-write behavior for all three derivation exceptions.

## Seam under test

`compile(profile) -> emitted grill-change/request-to-spec-issues bodies` via
golden fixtures.

## Allowed mock boundary

None.

## Test command guidance

Compiler workspace tests plus the golden suite via `npm run test`.

## Likely file ownership

- Canonical Phase-12 skill content for `grill-change` and
  `request-to-spec-issues`
- Generated target goldens and phase-24 documentation

## Dependencies

None; ready after amendment approval.

## Parallelism notes

Independent of phase-30 behavior, but it overlaps canonical skill-content and
golden files, so serialize with other skill-body changes.

## Contract impact

Changes the approval boundary: grill approval covers faithful synthesis and
bounded persistence, but not implementation or new scope.

## Security impact

Keeps the grill read-only until approval, retains client write controls, and
adds explicit stop-before-write exceptions.

## Documentation impact

Phase-24 spec, issue plan, generated skill descriptions, and workflow docs.

## Implementation context

Do not interpret “automatic” as silent: report what will be persisted and what
was persisted, but do not introduce a second approval question.

## Review expectations

Prove no pre-approval write path, no duplicate approval prompt, no automatic
implementation, and exact exception wording across Codex and Claude goldens.
