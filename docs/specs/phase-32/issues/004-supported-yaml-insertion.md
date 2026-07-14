# I4: Supported YAML insertion and exact refusal reasons

## Parent spec or request

`docs/specs/phase-32/001-guided-repository-update.md`

## Intent summary

Keep conservative insertion-only editing trustworthy by accepting ordinary
supported block mappings and reserving refusal for structures that are actually
unproven.

## Behavior slice

The field-log profile shape receives all offered workflow booleans, skills
packs, and reviewer-subagent pack through comment-preserving targeted
insertions. Unsafe syntax retains refusal with capability, canonical target
path, structural reason, and exact manual value.

## Non-goals

- Re-rendering YAML or modifying/removing existing values.
- Supporting anchors, aliases, flow mappings, multi-document insertion, or
  unknown ranges without a later proven contract.
- Interactive review presentation.

## Acceptance criteria

- Phase-32 acceptance criteria 7-8.
- The exact repository block shape from the field log produces no generic
  unsafe-target refusal and preserves all existing bytes outside insertions.
- Workflow, missing skills path, and existing nested subagent map insertions are
  each covered in the combined regression.
- Unsafe rows report stable exact reasons and manual paths/values.

## Expected RED proof

The combined field-log fixture refuses every selected insertion as unsafe even
though its targets are ordinary block mappings.

## Expected GREEN proof

The combined fixture inserts every selected value with byte-preservation
sentinels; the full unsafe-structure table remains green with richer refusal
records.

## Seam under test

`planProfileInsertions(source, selectedCapabilities) -> insertion plan`.

## Allowed mock boundary

None. Use literal YAML and real parser/editor/catalog entries.

## Test command guidance

Run the focused upgrade-editor regression and refusal table, then CLI tests,
check, lint, and verify:pack.

## Likely file ownership

- `apps/cli/src/upgrade-editor.ts`
- `apps/cli/src/upgrade-editor.test.ts`
- Refusal record/presentation types if needed

## Dependencies

`sequenced` after Phase 31 I8.

## Parallelism notes

Parallel-safe with Phase 32 I1 and I3. Avoid concurrent upgrade-editor changes
with I5 until this seam stabilizes.

## Contract impact

Behavior-corrective expansion of supported ordinary YAML; insertion-only and
unsafe-refusal contracts remain intact.

## Security impact

No shell/network/secret access; mutation planning remains in-memory and refuses
unproven structures.

## Documentation impact

Upgrade refusal guidance and supported-structure reference.

## Implementation context

Diagnose the parser/layout identity mismatch before changing guards. Do not
weaken anchor/flow/multi-document defenses to make the regression pass.

## Review expectations

Require explicit RED on the real field shape, byte sentinels, a table for every
refusal reason, and proof that no YAML re-render path was introduced.
