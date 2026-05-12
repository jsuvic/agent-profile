# Spec: Tabnine React Stack Guideline

## Status

Draft

## Problem

The verified Tabnine guidelines target (`phase-02/001`) emits a TypeScript +
Svelte stack file (`30-stack-typescript-svelte.md`) but no React equivalent.
The profile schema already accepts `react` in `stack.frameworks` as a generic
lowercase slug, so React stacks are *representable* but produce no
React-aware guideline output today. Teams adopting `agent-profile` for React
repos must either tolerate an inapplicable Svelte file or hand-edit
generated output, which breaks the determinism contract.

## Goal

Emit a conditional, short, segmented Tabnine guideline file
`30-stack-typescript-react.md` when `stack.frameworks` contains `react`. The
file must follow the same shape, security, and determinism contracts as the
existing seven phase-02 outputs.

## Non-Goals

- changing the `ai-profile.yaml` schema
- introducing a new target id
- generating Codex or Claude React artifacts (separate target specs)
- replacing or removing the Svelte guideline when both frameworks are
  present
- emitting global or user-level files
- detecting React at compile time without an explicit `stack.frameworks`
  entry

## User Flow

1. The user declares React in `ai-profile.yaml`:

   ```yaml
   stack:
     frameworks:
       - react
   ```

2. `agent-profile compile --dry-run` previews the new file alongside
   existing outputs.
3. `--write` emits `.tabnine/guidelines/30-stack-typescript-react.md`.
4. Profiles with both `react` and `svelte` emit both stack files. Profiles
   with neither emit neither.

## Inputs

- validated `AiProfile`
- `stack.frameworks` list
- derived `effectivePermissions`
- compiler determinism contract from `phase-01/003`
- golden test contract from `phase-01/005`

## Outputs

Amendment to the `phase-02/001` Output Contract adding:

| Output path                                          | Template id                                              |
| ---------------------------------------------------- | -------------------------------------------------------- |
| `.tabnine/guidelines/30-stack-typescript-react.md`   | `targets/tabnine-guidelines/30-stack-typescript-react@1` |

New golden fixture under
`fixtures/react-typescript/expected/.tabnine/guidelines/30-stack-typescript-react.md`.

## Generated Artifact Shape

The file begins with the standard generated-file header and covers, in
stable section order:

- TypeScript discipline: no `any` without reason, explicit public types,
  reuse before create
- React component conventions: function components, hooks, typed props
- Hook discipline: no unnecessary memoization, no global state by default
- Styling: follow existing approach, no new CSS framework or component
  library
- API call patterns: reuse client utilities, typed request and response
- SDD/TDD checklist tailored to React (state, API calls, error and loading
  states, accessibility)
- Reference to `90-final-review.md` for the shared final review block;
  do not duplicate the checklist body

The file remains under Tabnine's recommended 500-line limit.

## Contracts

- Output is conditional on `stack.frameworks` containing `react`.
- Absence of `react` produces no output and no warning.
- Output is byte-identical across runs given the same input.
- The file must not duplicate the final-review block from
  `90-final-review.md`.
- The file must not duplicate Svelte-specific content.
- Output respects `effectivePermissions` for shell, dependency, network,
  secret, and production access.

## Security Rules

- Do not include literal secrets or environment values.
- Do not instruct Tabnine to upload source code.
- Do not grant production access.
- Do not instruct automatic dependency installation.
- Do not instruct unsafe auto-approval.

## Acceptance Criteria

- new template id and output path appear in the phase-02 output contract
- profiles with `react` produce the file; profiles without it do not
- golden output is byte-identical
- file is under 500 lines
- file references `90-final-review.md` instead of duplicating its content
- no other phase-02 outputs change

## Tests

- golden test for the new file
- absence-of-output test (no `react` in `stack.frameworks` → no file)
- co-presence test (`react` and `svelte` → both files emitted)
- LF and trailing-newline determinism test
- secret-pattern absence test
- final-review duplication regression test

## Documentation Updates

- amend `phase-02/001` Output Contract table
- future `docs/targets/tabnine.md`
- `fixtures/README.md`

## Final Review Checklist

- conditional render rules are deterministic
- no schema changes
- no duplication of shared final-review content
- file size under 500 lines
- security contract matches phase-02
