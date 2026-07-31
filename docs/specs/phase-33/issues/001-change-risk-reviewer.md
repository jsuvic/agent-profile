# I1: Emit the independent change-risk reviewer

## Parent spec or request

`docs/specs/phase-33/001-change-risk-review-assurance.md`

## Intent summary

Give Codex and Claude a dedicated, fresh-context reviewer whose only objective
is to find product-risk gaps across the complete accumulated change and its
consumers.

## Behavior slice

For every profile that qualifies for the generated subagent-driven workflow,
emit a `change-risk-reviewer` definition for supported Codex and Claude
targets. The prompt is review-only, receives complete and lossless access to
the change snapshot and governing rules, searches the applicable closed risk
domains, and returns prioritized evidence-bearing findings with normalized
fingerprints inside the closed typed `change-risk/v2` result envelope.

The generated `change-risk-reviewer` identifier resolves its provider-neutral
model policy through the existing `critical-reviewer` role. Mapping-v2,
mapping-v3, target-native effort, and exact per-client overrides retain their
configured critical-review capability without adding a new role ID.

Before adding the prompt, establish one immutable review-policy/content source
for the `change-risk/v2` identifier, result statuses, priorities,
dispositions, resolutions, terminal statuses, retry limits, confirmation
triggers, canonical risk-domain and category identifier sets, and high-risk
surfaces. That source exposes explicit reviewer, orchestration,
learning-record, promotion, and evaluation projections; each target-specific
artifact renders only the projection it needs so later orchestration slices
cannot drift and no artifact receives unrelated policy sections.

This slice also renders, once, a complete un-projected policy rendering as a
versioned checked-in evaluation fixture — the pinned pre-simplification
baseline that I6's context-ablation comparison consumes. It is test/eval
material only, never a shipped artifact. The policy source additionally owns
the `change-risk-categories/v1` taxonomy (canonical identifiers, alias
table, `uncategorized` fallback) and the deterministic path/contract
predicates for high-risk classification from the parent spec.

## Non-goals

- Orchestrating retries or fixes; I2 owns that behavior.
- Writing review-learning records; I3 owns that behavior.
- Running an external hosted reviewer.
- Adding a new profile-schema toggle.
- Adding or migrating a model-policy role ID.

## Acceptance criteria

- Qualifying Codex and Claude outputs contain the reviewer with no dangling
  reference.
- Non-qualifying profiles remain unchanged.
- Initial/final clean-room inputs exclude implementer reports, prior praise,
  and prior finding lists.
- The prompt requires complete and lossless snapshot access per the parent
  snapshot disclosure contract (manifest-first, not eager full-diff
  injection), unchanged-consumer inspection, applicability marking for every
  closed risk domain, P1/P2/P3, a component-derived normalized fingerprint,
  concrete evidence, affected contract/safe path, and read-only behavior.
- The prompt returns exactly one valid typed `ChangeRiskResultV1` envelope
  with `CLEAN | FINDINGS_FOUND | NEEDS_CONTEXT` and the parent
  scope/`missingInputs`/disposition relationships; empty, malformed,
  mismatched, or incomplete output cannot mean clean.
- Mapping-v2, mapping-v3, target-native effort, and exact override fixtures
  prove resolution through `critical-reviewer`.
- Shared closed policy values have one authoritative typed source.
- That source exposes explicit reviewer, orchestration, learning-record,
  promotion, and evaluation projections.
- Each generated artifact contains only the projection needed by that
  artifact.
- Reviewer definitions do not contain fix-round limits, promotion thresholds,
  historical-corpus instructions, or learning-record schema details.
- Orchestration skills do not duplicate the complete reviewer rubric;
  detailed domain rubrics live in selectively loaded reference material.
- Projection tests prove both required inclusion and forbidden unrelated
  content.
- The pinned pre-simplification baseline fixture exists, is versioned, and
  is excluded from shipped output.
- The `change-risk-categories/v1` taxonomy and high-risk predicates have
  focused unit tests, including alias precedence, `uncategorized` fallback,
  and qualifying/non-qualifying boundary paths.

## Expected RED proof

A compiler/unit test expecting the new reviewer and its closed policy values
fails because neither exists.

## Expected GREEN proof

Policy tests and Codex/Claude golden fixtures pass; negative fixture output
remains byte-identical.

## Seam under test

Deterministic generator:
`compile(profile) -> emitted reviewer definition`, supported by the immutable
policy object's public values.

## Allowed mock boundary

None. Compiler input and emitted files are deterministic.

## Test command guidance

Run focused core/compiler policy and reviewer-emission tests first, then the
affected compiler golden suite.

## Likely file ownership

- `packages/core/src/profile.ts` or the existing built-in reviewer-definition
  source
- `packages/compiler/src/compiler.ts`
- A focused review-policy/content module under `packages/compiler/src/`
- `packages/compiler/src/skill-selection.ts` when conditional emission needs
  extension
- Existing model-policy resolver/guidance seams for the `critical-reviewer`
  mapping
- Codex/Claude expected fixtures and focused core/compiler tests

## Dependencies

`ready`; first feature slice. R1 from the parent spec is implemented inside
this slice.

## Parallelism notes

None. I3 is sequenced after this slice because it consumes the shared policy
source and its learning-record projection.

## Contract impact

Adds one built-in reviewer artifact for qualifying subagent-driven profiles.
It reuses the public `critical-reviewer` model-policy role; no
`ai-profile.yaml` schema or role-ID change.

## Security impact

Reviewer remains read-only, source-local, secret-denied, and network/production
denied. Prompt evidence must describe secret-shaped data without copying it.

## Documentation impact

Update reviewer-role/capability documentation when it enumerates built-in
roles.

## Implementation context

Current generated spec and code-quality reviewers are anchored to task/spec
context and a supplied changed-file list. The new reviewer must not be a third
variant of that prompt. Keep the skill body concise; put repeated closed
values in the shared policy source and render them consistently.

## Review expectations

Adversarially verify that the reviewer can challenge an incomplete spec,
reaches unchanged consumers, receives the whole snapshot, and cannot edit or
self-approve.
