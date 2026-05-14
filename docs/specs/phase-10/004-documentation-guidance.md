# Spec: Documentation Guidance

## Status

Draft

## Problem

Neither the verified phase-02 Tabnine output nor the verified
`phase-01/004` `AGENTS.md` output has a dedicated documentation section.
Documentation expectations are implicit in Tabnine's
`00-general-agent-behavior.md` and absent from `AGENTS.md` entirely.
Teams want a short, targeted block describing when to update docs, the
preferred documentation style, README modification rules, and a code
comment policy — matching Tabnine's recommended segmentation and giving
Codex/Claude the same guidance through `AGENTS.md`.

## Goal

Emit conditional documentation guidance across all guidance surfaces when
`workflow.documentation` is `true`:

- one Tabnine guideline file `80-documentation.md`
- one conditional `## Documentation` section in `AGENTS.md`, inserted at a
  stable position
- no change to `CLAUDE.md` — the section is reached via `@AGENTS.md`
  import; duplicating it would violate the `phase-03/003` non-duplication
  contract

Both physical outputs follow the determinism, security, and golden-test
contracts of their owning targets.

## Non-Goals

- changing the `ai-profile.yaml` schema beyond a single optional
  `workflow.documentation` boolean
- generating Codex or Claude workflow skill files
- emitting `CLAUDE.md` content (reached via import)
- introducing a new target id
- emitting global, user-level, or managed-policy files
- generating README or wiki content directly
- duplicating the Tabnine `90-final-review.md` block or the `AGENTS.md`
  `## Completion Checklist`

## User Flow

1. The user enables documentation guidance in `ai-profile.yaml`:

   ```yaml
   workflow:
     documentation: true
   ```

2. `agent-profile compile --dry-run` previews:
   - the new Tabnine file `.tabnine/guidelines/80-documentation.md`
   - the new `## Documentation` section in `AGENTS.md`
   - `CLAUDE.md` unchanged
3. `--write` emits both files in their new shapes.

## Inputs

- validated `AiProfile`
- `workflow.documentation` flag (small additive schema field)
- derived `effectivePermissions`
- compiler determinism contract from `phase-01/003`
- golden test contract from `phase-01/005`
- `AGENTS.md` Content Contract from `phase-01/004`
- Tabnine Output Contract from `phase-02/001`

## Outputs

Amendment to the `phase-02/001` Output Contract adding:

| Output path                                | Template id                                     |
| ------------------------------------------ | ----------------------------------------------- |
| `.tabnine/guidelines/80-documentation.md`  | `targets/tabnine-guidelines/80-documentation@1` |

Amendment to the `phase-01/004` Content Contract adding a conditional
section:

| Section title       | Insertion position                                                                       | Gate                            |
| ------------------- | ---------------------------------------------------------------------------------------- | ------------------------------- |
| `## Documentation`  | immediately after `## Refactoring` if present, else `## Code Review` if present, else `## Development Workflow` | `workflow.documentation: true`  |

No amendment to `phase-03/003`. `CLAUDE.md` golden output remains
unchanged.

New golden fixtures:

- `fixtures/documentation-enabled/expected/.tabnine/guidelines/80-documentation.md`
- `fixtures/documentation-enabled/expected/AGENTS.md` (includes the new
  section at the declared position; all other AGENTS.md sections
  byte-identical aside from the inserted section)
- `fixtures/documentation-enabled/expected/CLAUDE.md` (byte-identical to
  the equivalent disabled fixture aside from any unrelated profile-driven
  differences)

## Generated Artifact Shape

Both the Tabnine file and the `AGENTS.md` section cover, in stable order:

- when to update documentation (setup, workflow, public API, config, env
  vars, testing commands, deployment, troubleshooting)
- documentation style (write for maintainers, copy/paste commands, current
  examples, file paths when relevant)
- README modification rules (keep existing structure, add only relevant
  sections, do not rewrite without request)
- code comment policy (non-obvious business rules, tricky edge cases,
  surprising technical constraints, security-sensitive behavior; never
  comments that restate the code)
- reference to the shared final-review block (in Tabnine, the existing
  `90-final-review.md`; in `AGENTS.md`, the existing `## Completion
  Checklist`); do not duplicate the checklist body

The Tabnine file remains under Tabnine's recommended 500-line limit. The
`AGENTS.md` section remains short and prose-style.

The Tabnine file and the `AGENTS.md` section render the same topic
boundaries from the same target-neutral content source, with shape adapted
to each target.

## Contracts

- Both outputs are conditional on `workflow.documentation: true`.
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
- Do not instruct any AI to expose internal or private URLs.
- Do not instruct any AI to upload source code.
- Do not instruct documentation of risky commands without explicit
  warning.
- Do not instruct automatic dependency installation.

## Acceptance Criteria

- new Tabnine template id and output path appear in the `phase-02/001`
  Output Contract
- new `AGENTS.md` conditional section appears in the `phase-01/004`
  Content Contract with its insertion position declared
- profiles with `workflow.documentation: true` produce both outputs;
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
  `workflow.documentation` field
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
