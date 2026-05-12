# Spec: Tabnine Documentation Guideline

## Status

Draft

## Problem

The verified phase-02 Tabnine output has no dedicated documentation file.
Documentation expectations are implicit in `00-general-agent-behavior.md`.
Teams want a short, targeted file describing when to update docs, the
preferred documentation style, README modification rules, and a code
comment policy — matching Tabnine's recommended segmentation.

## Goal

Emit a conditional, short Tabnine guideline file `80-documentation.md`
when `workflow.documentation` is true. The file must follow the same
shape, security, and determinism contracts as existing phase-02 outputs.

## Non-Goals

- changing the `ai-profile.yaml` schema beyond a single optional
  `workflow.documentation` boolean
- generating Codex or Claude documentation artifacts
- introducing a new target id
- emitting global or user-level files
- generating README or wiki content directly
- duplicating the final-review block from `90-final-review.md`

## User Flow

1. The user enables documentation guidance in `ai-profile.yaml`:

   ```yaml
   workflow:
     documentation: true
   ```

2. `agent-profile compile --dry-run` previews the new file.
3. `--write` emits `.tabnine/guidelines/80-documentation.md`.

## Inputs

- validated `AiProfile`
- `workflow.documentation` flag (small additive schema field)
- derived `effectivePermissions`
- compiler determinism contract from `phase-01/003`
- golden test contract from `phase-01/005`

## Outputs

Amendment to the `phase-02/001` Output Contract adding:

| Output path                                | Template id                                    |
| ------------------------------------------ | ---------------------------------------------- |
| `.tabnine/guidelines/80-documentation.md`  | `targets/tabnine-guidelines/80-documentation@1` |

New golden fixture under
`fixtures/documentation-enabled/expected/.tabnine/guidelines/80-documentation.md`.

## Generated Artifact Shape

The file begins with the standard generated-file header and covers, in
stable section order:

- when to update documentation (setup, workflow, public API, config, env
  vars, testing commands, deployment, troubleshooting)
- documentation style (write for maintainers, copy/paste commands, current
  examples, file paths when relevant)
- README modification rules (keep existing structure, add only relevant
  sections, do not rewrite without request)
- code comment policy (non-obvious business rules, tricky edge cases,
  surprising technical constraints, security-sensitive behavior; never
  comments that restate the code)
- reference to `90-final-review.md`; do not duplicate the checklist body

The file remains under Tabnine's recommended 500-line limit.

## Contracts

- Output is conditional on `workflow.documentation: true`.
- Absence of the flag produces no output and no warning.
- Output is byte-identical across runs given the same input.
- The file must not duplicate the final-review block from
  `90-final-review.md`.
- Output respects `effectivePermissions`.

## Security Rules

- Do not include literal secrets or environment values.
- Do not instruct Tabnine to expose internal or private URLs.
- Do not instruct Tabnine to upload source code.
- Do not instruct documentation of risky commands without explicit
  warning.
- Do not instruct automatic dependency installation.

## Acceptance Criteria

- new template id and output path appear in the phase-02 output contract
- profiles with `workflow.documentation: true` produce the file; profiles
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
  `workflow.documentation` field
- future `docs/targets/tabnine.md`
- `fixtures/README.md`

## Final Review Checklist

- conditional render rules are deterministic
- schema change is a single optional boolean, fully backward compatible
- no duplication of shared final-review content
- file size under 500 lines
- security contract matches phase-02
