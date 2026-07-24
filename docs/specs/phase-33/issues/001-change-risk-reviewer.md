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
targets. The prompt is review-only, receives a complete change snapshot and
governing rules, searches the approved risk domains, and returns prioritized
evidence-bearing findings with stable fingerprints.

Before adding the prompt, establish one immutable review-policy/content source
for priorities, dispositions, terminal statuses, retry limits, confirmation
triggers, and high-risk surfaces. Render target-specific artifacts from that
source so later orchestration slices cannot drift.

## Non-goals

- Orchestrating retries or fixes; I2 owns that behavior.
- Writing review-learning records; I3 owns that behavior.
- Running an external hosted reviewer.
- Adding a new profile-schema toggle.

## Acceptance criteria

- Qualifying Codex and Claude outputs contain the reviewer with no dangling
  reference.
- Non-qualifying profiles remain unchanged.
- Initial/final clean-room inputs exclude implementer reports, prior praise,
  and prior finding lists.
- The prompt requires complete-snapshot and unchanged-consumer inspection,
  every risk domain from the parent spec, P1/P2/P3, a stable fingerprint,
  concrete evidence, affected contract/safe path, and read-only behavior.
- Shared closed policy values have one authoritative source and focused unit
  tests.

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
- Codex/Claude expected fixtures and focused core/compiler tests

## Dependencies

`ready`; first feature slice. R1 from the parent spec is implemented inside
this slice.

## Parallelism notes

Parallel-safe with I3 if file ownership is split so I3 does not edit the shared
policy module.

## Contract impact

Adds one built-in reviewer role and generated artifact for qualifying
subagent-driven profiles. No `ai-profile.yaml` schema change.

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
