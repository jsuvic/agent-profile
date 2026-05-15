# Spec: Code Review Guidance

## Status

Approved

## Problem

The verified phase-02 Tabnine output folds review concerns into
`00-general-agent-behavior.md` and `90-final-review.md`. The verified
`phase-01/004` `AGENTS.md` output has no dedicated review section at all —
review-adjacent rules live implicitly in `## Safety Rules` and
`## Completion Checklist`. Teams using AI agents to review pull requests
want a dedicated, short, segmented block with concrete severity labels,
review focus, and output format — which is the segmentation style Tabnine
itself recommends and which Codex and Claude both benefit from when
reviewing through `AGENTS.md`.

Folding review guidance into general-behavior or completion-checklist
sections produces longer, less targeted artifacts and forces the user to
hand-edit on every surface separately. Centralizing review content behind a
single conditional gate solves the gap consistently across targets.

## Goal

Emit conditional code-review guidance across all guidance surfaces when
`workflow.codeReview` is `true`:

- one Tabnine guideline file `60-code-review.md`
- one conditional `## Code Review` section in `AGENTS.md`, inserted at a
  stable position
- no change to `CLAUDE.md` — the section is reached via `@AGENTS.md`
  import; duplicating it would violate the `phase-03/003` non-duplication
  contract

Both physical outputs follow the determinism, security, and golden-test
contracts of their owning targets.

## Non-Goals

- changing the `ai-profile.yaml` schema beyond a single optional
  `workflow.codeReview` boolean
- generating Codex or Claude workflow skill files
- emitting `CLAUDE.md` content (reached via import)
- introducing a new target id
- emitting global, user-level, or managed-policy files
- duplicating the Tabnine `90-final-review.md` block or the `AGENTS.md`
  `## Completion Checklist`
- adding new doctor checks (`phase-04` already covers safety drift)

## User Flow

1. The user enables review guidance in `ai-profile.yaml`:

   ```yaml
   workflow:
     codeReview: true
   ```

2. `agent-profile compile --dry-run` previews:
   - the new Tabnine file `.tabnine/guidelines/60-code-review.md`
   - the new `## Code Review` section in `AGENTS.md`
   - `CLAUDE.md` unchanged
3. `--write` emits both files in their new shapes.
4. Profiles without `workflow.codeReview` emit neither output.

## Inputs

- validated `AiProfile`
- `workflow.codeReview` flag (small additive schema field)
- derived `effectivePermissions`
- compiler determinism contract from `phase-01/003`
- golden test contract from `phase-01/005`
- `AGENTS.md` Content Contract from `phase-01/004`
- Tabnine Output Contract from `phase-02/001`

## Outputs

Amendment to the `phase-02/001` Output Contract adding:

| Output path                              | Template id                                   |
| ---------------------------------------- | --------------------------------------------- |
| `.tabnine/guidelines/60-code-review.md`  | `targets/tabnine-guidelines/60-code-review@1` |

Amendment to the `phase-01/004` Content Contract adding a conditional
section:

| Section title       | Insertion position                          | Gate                          |
| ------------------- | ------------------------------------------- | ----------------------------- |
| `## Code Review`    | immediately after `## Development Workflow` | `workflow.codeReview: true`   |

No amendment to `phase-03/003`. `CLAUDE.md` golden output remains
unchanged.

New golden fixtures:

- `fixtures/code-review-enabled/expected/.tabnine/guidelines/60-code-review.md`
- `fixtures/code-review-enabled/expected/AGENTS.md` (includes the new
  section at the declared position; all other AGENTS.md sections
  byte-identical aside from the inserted section)
- `fixtures/code-review-enabled/expected/CLAUDE.md` (byte-identical to
  the equivalent disabled fixture aside from any unrelated profile-driven
  differences)

## Generated Artifact Shape

Both the Tabnine file and the `AGENTS.md` section cover, in stable order:

- review focus list (correctness, edge cases, security, performance,
  unnecessary complexity, project-style consistency, missing tests, weak
  typing, accessibility, error handling, dependency risk, spec compliance)
- severity labels: Blocker, High, Medium, Low — with one-line definitions
- review output format: Summary, Spec Compliance, Findings (by severity),
  Tests, Safety Review, Final recommendation
- review discipline rules (no nitpicks if autoformatter handles it, no
  broad rewrite suggestions, actionable comments only, mention
  file/function/component)
- reference to the shared final-review block (in Tabnine, the existing
  `90-final-review.md`; in `AGENTS.md`, the existing `## Completion
  Checklist`); do not duplicate the checklist body

The Tabnine file remains under Tabnine's recommended 500-line limit. The
`AGENTS.md` section remains short and prose-style.

The Tabnine file and the `AGENTS.md` section render the same topic
boundaries from the same target-neutral content source, with shape adapted
to each target.

## Contracts

- Both outputs are conditional on `workflow.codeReview: true`.
- Absence of the flag produces no Tabnine file and no `AGENTS.md` section,
  with no warning, on every affected target.
- Each output is byte-identical across runs given the same input.
- The Tabnine file must not duplicate the final-review block from
  `90-final-review.md`.
- The `AGENTS.md` section must not duplicate the `## Completion
  Checklist`.
- Outputs respect `effectivePermissions`.
- `CLAUDE.md` is byte-identical across the phase boundary; the
  non-duplication invariant from `phase-03/003` is preserved.
- The existing `phase-01/004` fixed section order is preserved when the
  gate is closed; the new section inserts at the declared position
  without reordering the existing nine.

## Security Rules

- Do not include literal secrets or environment values.
- Do not instruct any AI to upload source code.
- Do not instruct production access during review.
- Do not instruct automatic dependency installation.
- Do not instruct unsafe auto-approval.

## Acceptance Criteria

- new Tabnine template id and output path appear in the `phase-02/001`
  Output Contract
- new `AGENTS.md` conditional section appears in the `phase-01/004`
  Content Contract with its insertion position declared
- profiles with `workflow.codeReview: true` produce both outputs;
  profiles without it produce neither
- both golden outputs are byte-identical
- Tabnine file is under 500 lines
- both outputs reference the shared checklist instead of duplicating its
  content
- no other Tabnine outputs change
- no other `AGENTS.md` sections change in section text or order
- `CLAUDE.md` golden output unchanged

## Tests

- golden test for the new Tabnine file
- golden test for the amended `AGENTS.md`
- absence-of-output test on both surfaces
- LF and trailing-newline determinism test on both outputs
- secret-pattern absence test on both outputs
- duplication regression test: Tabnine file does not contain the
  final-review block; `AGENTS.md` section does not contain the completion
  checklist
- `CLAUDE.md` golden unchanged regression test

## Documentation Updates

- amend `phase-02/001` Output Contract table
- amend `phase-01/004` Content Contract section order
- amend `phase-01/001-profile-schema-v1.md` to document the optional
  `workflow.codeReview` field
- future `docs/targets/tabnine.md`
- future `docs/targets/agents-md.md`
- `fixtures/README.md`

## Final Review Checklist

- conditional render rules are deterministic across both surfaces
- schema change is a single optional boolean, fully backward compatible
- no duplication of shared final-review or completion-checklist content
- Tabnine file size under 500 lines
- security contract matches the owning target on each surface
- `CLAUDE.md` is not modified
