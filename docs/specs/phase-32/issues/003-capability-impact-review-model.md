# I3: Capability impact and editable-review model

## Parent spec or request

`docs/specs/phase-32/001-guided-repository-update.md`

## Intent summary

Give users enough stable product information to understand and edit capability
choices before previewing any profile mutation.

## Behavior slice

Versioned catalog-derived impact metadata and a pure review builder produce one
ordered editable item per offered capability: current/proposed value,
enabled/disabled consequence, affected/non-affected clients, generated artifact
families, prerequisites, and tradeoffs.

## Non-goals

- Interactive prompts or filesystem writes.
- Permission-posture choices owned by Phase 31 configure.
- A recommended subset or heuristic selection algorithm.

## Acceptance criteria

- Phase-32 acceptance criterion 4.
- Every offered catalog entry has complete impact metadata and stable ordering.
- Adopt all supplies all proposed values as enabled/included; Customize uses
  the caller's current selection; neither state is accepted automatically.
- Disabled consequences and explicit non-effects are present, not inferred by
  presentation code.
- Metadata is versioned with the capability catalog contract.

## Expected RED proof

The current catalog/upgrade presentation can list IDs and manual lines but
cannot build complete consequence/client/artifact review items.

## Expected GREEN proof

Completeness and deterministic golden tables pass for every catalog entry, and
selection changes yield the exact expected review model.

## Seam under test

`buildCapabilityAdoptionReview(profile, offered, selection) -> readonly ReviewItem[]`.

## Allowed mock boundary

None. Use real catalog descriptors and immutable profile inputs.

## Test command guidance

Run focused core/catalog and CLI review-model tests, then core/CLI suites, check,
lint, verify:pack, and package dry-run.

## Likely file ownership

- Versioned capability catalog descriptor
- Core offered/current-value resolution
- Pure CLI/domain review model and tests

## Dependencies

`sequenced` after Phase 31.5 I9.

## Parallelism notes

Parallel-safe with Phase 32 I1 and I4 after Phase 31.5. Own catalog/review data;
I5 owns prompts and writes.

## Contract impact

Adds versioned user-facing metadata without changing offered-set computation or
the scripted adopt-all flag.

## Security impact

Static metadata only; no filesystem, network, client, secret, or mutation
access.

## Documentation impact

Capability reference and review terminology.

## Implementation context

Centralize exact descriptors so schema, resolver, CLI, docs, and tests cannot
drift. Do not encode prose independently in the prompt adapter.

## Review expectations

Require catalog-wide completeness, deterministic order, deep immutability, and
an explicit boundary excluding permission postures from upgrade.
