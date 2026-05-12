# Spec: Tabnine Code Review Guideline

## Status

Draft

## Problem

The verified phase-02 Tabnine output folds review concerns into
`00-general-agent-behavior.md` and `90-final-review.md`. Teams using
Tabnine Agent to review pull requests want a dedicated, short, segmented
file with concrete severity labels, review focus, and output format —
which is the segmentation style Tabnine itself recommends. Folding review
guidance into the general behavior file produces a longer, less targeted
artifact than the recommended structure.

## Goal

Emit a conditional, short Tabnine guideline file `60-code-review.md` when
`workflow.codeReview` is true. The file must follow the same shape,
security, and determinism contracts as the existing phase-02 outputs.

## Non-Goals

- changing the `ai-profile.yaml` schema beyond a single optional
  `workflow.codeReview` boolean
- generating Codex or Claude review artifacts
- introducing a new target id
- emitting global or user-level files
- duplicating the final-review block from `90-final-review.md`
- adding new doctor checks (`phase-04` already covers safety drift)

## User Flow

1. The user enables review guidance in `ai-profile.yaml`:

   ```yaml
   workflow:
     codeReview: true
   ```

2. `agent-profile compile --dry-run` previews the new file.
3. `--write` emits `.tabnine/guidelines/60-code-review.md`.
4. Profiles without `workflow.codeReview` do not emit the file.

## Inputs

- validated `AiProfile`
- `workflow.codeReview` flag (small additive schema field)
- derived `effectivePermissions`
- compiler determinism contract from `phase-01/003`
- golden test contract from `phase-01/005`

## Outputs

Amendment to the `phase-02/001` Output Contract adding:

| Output path                              | Template id                                  |
| ---------------------------------------- | -------------------------------------------- |
| `.tabnine/guidelines/60-code-review.md`  | `targets/tabnine-guidelines/60-code-review@1` |

New golden fixture under
`fixtures/code-review-enabled/expected/.tabnine/guidelines/60-code-review.md`.

## Generated Artifact Shape

The file begins with the standard generated-file header and covers, in
stable section order:

- review focus list (correctness, edge cases, security, performance,
  unnecessary complexity, project-style consistency, missing tests,
  weak typing, accessibility, error handling, dependency risk, spec
  compliance)
- severity labels: Blocker, High, Medium, Low — with one-line definitions
- review output format with three short sections: Summary, Spec
  Compliance, Findings (by severity), Tests, Safety Review, Final
  recommendation
- review discipline rules (no nitpicks if autoformatter handles it, no
  broad rewrite suggestions, actionable comments only, mention
  file/function/component)
- reference to `90-final-review.md`; do not duplicate the checklist body

The file remains under Tabnine's recommended 500-line limit and stays
short by deferring shared content to `90-final-review.md`.

## Contracts

- Output is conditional on `workflow.codeReview: true`.
- Absence of the flag produces no output and no warning.
- Output is byte-identical across runs given the same input.
- The file must not duplicate the final-review block from
  `90-final-review.md`.
- Output respects `effectivePermissions`.

## Security Rules

- Do not include literal secrets or environment values.
- Do not instruct Tabnine to upload source code.
- Do not instruct production access during review.
- Do not instruct automatic dependency installation.
- Do not instruct unsafe auto-approval.

## Acceptance Criteria

- new template id and output path appear in the phase-02 output contract
- profiles with `workflow.codeReview: true` produce the file; profiles
  without it do not
- golden output is byte-identical
- file is under 500 lines
- file references `90-final-review.md` instead of duplicating its content
- no other phase-02 outputs change

## Tests

- golden test for the new file
- absence-of-output test
- LF and trailing-newline determinism test
- secret-pattern absence test
- final-review duplication regression test

## Documentation Updates

- amend `phase-02/001` Output Contract table
- amend `phase-01/001-profile-schema-v1.md` to document the optional
  `workflow.codeReview` field
- future `docs/targets/tabnine.md`
- `fixtures/README.md`

## Final Review Checklist

- conditional render rules are deterministic
- schema change is a single optional boolean, fully backward compatible
- no duplication of shared final-review content
- file size under 500 lines
- security contract matches phase-02
