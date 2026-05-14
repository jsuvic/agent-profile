# Spec: React Stack Guidance

## Status

Draft

## Problem

Three verified guidance targets currently have a React coverage gap:

- The Tabnine guidelines target (`phase-02/001`) emits a TypeScript + Svelte
  stack file (`30-stack-typescript-svelte.md`) but no React equivalent.
- The `AGENTS.md` target (`phase-01/004`) renders `stack.frameworks` as a
  bare array under `## Stack` but emits no framework-specific guidance.
- The `CLAUDE.md` target (`phase-03/003`) reaches the same content via
  `@AGENTS.md` import, so any gap in `AGENTS.md` is also a Claude gap.

The profile schema already accepts `react` in `stack.frameworks` as a
generic lowercase slug, so React stacks are *representable* but produce no
React-aware guideline output today. Teams adopting `agent-profile` for
React repos must tolerate an inapplicable Svelte file (Tabnine) or hand-edit
generated output (AGENTS.md), which breaks the determinism contract.

## Goal

Emit conditional React stack guidance across all guidance surfaces when
`stack.frameworks` contains `react`:

- one Tabnine guideline file `30-stack-typescript-react.md`
- one conditional `## Stack Guidance — React` section in `AGENTS.md`
  (inserted at a stable position relative to the fixed nine sections)
- no change to `CLAUDE.md` — the section is reached via `@AGENTS.md`
  import; duplicating it would violate the `phase-03/003` non-duplication
  contract

Both physical outputs (Tabnine file, `AGENTS.md` section) follow the
determinism, security, and golden-test contracts of their owning targets.

## Non-Goals

- changing the `ai-profile.yaml` schema (React is already accepted in
  `stack.frameworks`)
- introducing a new target id on any surface
- generating Codex or Claude workflow skill files
- emitting `CLAUDE.md` content (reached via import)
- emitting global, user-level, or managed-policy files
- replacing or removing the Svelte guideline when both frameworks are
  present
- detecting React at compile time without an explicit `stack.frameworks`
  entry
- bikeshedding the exact React opinions; the content boundary is the only
  thing this spec fixes

## User Flow

1. The user declares React in `ai-profile.yaml`:

   ```yaml
   stack:
     frameworks:
       - react
   ```

2. `agent-profile compile --dry-run` previews:
   - the new Tabnine file `.tabnine/guidelines/30-stack-typescript-react.md`
   - the new `## Stack Guidance — React` section appended to `AGENTS.md`
   - `CLAUDE.md` unchanged
3. `--write` emits both files in their new shapes.
4. Profiles with both `react` and `svelte` emit both Tabnine stack files
   and both `## Stack Guidance` sections in `AGENTS.md`. Profiles with
   neither emit neither.

## Inputs

- validated `AiProfile`
- `stack.frameworks` list
- derived `effectivePermissions`
- compiler determinism contract from `phase-01/003`
- golden test contract from `phase-01/005`
- `AGENTS.md` Content Contract from `phase-01/004`
- Tabnine Output Contract from `phase-02/001`

## Outputs

Amendment to the `phase-02/001` Output Contract adding:

| Output path                                          | Template id                                              |
| ---------------------------------------------------- | -------------------------------------------------------- |
| `.tabnine/guidelines/30-stack-typescript-react.md`   | `targets/tabnine-guidelines/30-stack-typescript-react@1` |

Amendment to the `phase-01/004` Content Contract adding a conditional
section:

| Section title                  | Insertion position             | Gate                            |
| ------------------------------ | ------------------------------ | ------------------------------- |
| `## Stack Guidance — React`    | immediately after `## Stack`   | `stack.frameworks` contains `react` |

No amendment to `phase-03/003`. `CLAUDE.md` golden output remains unchanged.

New golden fixtures:

- `fixtures/react-typescript/expected/.tabnine/guidelines/30-stack-typescript-react.md`
- `fixtures/react-typescript/expected/AGENTS.md` (includes the new section
  at the declared position; all other AGENTS.md sections byte-identical to
  the equivalent non-React fixture except for the inserted section)
- `fixtures/react-typescript/expected/CLAUDE.md` (byte-identical to
  equivalent non-React fixture aside from any unrelated profile-driven
  differences)

## Generated Artifact Shape

Both the Tabnine file and the `AGENTS.md` section cover, in stable order:

- TypeScript discipline: no `any` without reason, explicit public types,
  reuse before create
- React component conventions: function components, hooks, typed props
- Hook discipline: no unnecessary memoization, no global state by default
- Styling: follow existing approach, no new CSS framework or component
  library
- API call patterns: reuse client utilities, typed request and response
- SDD/TDD checklist tailored to React (state, API calls, error and loading
  states, accessibility)
- Reference to the shared final-review checklist (in Tabnine, the existing
  `90-final-review.md`; in `AGENTS.md`, the existing `## Completion
  Checklist`); do not duplicate the checklist body

The Tabnine file remains under Tabnine's recommended 500-line limit. The
`AGENTS.md` section remains short and prose-style, consistent with the
existing AGENTS.md sections.

The Tabnine file and the `AGENTS.md` section render the same topic
boundaries from the same target-neutral content source, with shape
adapted to each target.

## Contracts

- Both outputs are conditional on `stack.frameworks` containing `react`.
- Absence of `react` produces no Tabnine file and no `AGENTS.md` section,
  with no warning, on every affected target.
- Each output is byte-identical across runs given the same input.
- The Tabnine file must not duplicate the final-review block from
  `90-final-review.md`.
- The `AGENTS.md` section must not duplicate the `## Completion
  Checklist`.
- Outputs respect `effectivePermissions` for shell, dependency, network,
  secret, and production access.
- `CLAUDE.md` is byte-identical across the phase boundary; the
  non-duplication invariant from `phase-03/003` is preserved.
- The existing `phase-01/004` fixed section order is preserved when no
  conditional gate fires; new conditional sections insert at declared
  positions without reordering the existing nine.

## Security Rules

- Do not include literal secrets or environment values.
- Do not instruct any AI to upload source code.
- Do not grant production access.
- Do not instruct automatic dependency installation.
- Do not instruct unsafe auto-approval.

## Acceptance Criteria

- new Tabnine template id and output path appear in the `phase-02/001`
  Output Contract
- new `AGENTS.md` conditional section appears in the `phase-01/004`
  Content Contract with its insertion position declared
- profiles with `react` produce both outputs; profiles without it produce
  neither
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
- absence-of-output test (no `react` in `stack.frameworks` → no new
  Tabnine file and no new `AGENTS.md` section)
- co-presence test (`react` and `svelte` → both Tabnine files and both
  `## Stack Guidance` sections emitted)
- LF and trailing-newline determinism test on both outputs
- secret-pattern absence test on both outputs
- duplication regression test: Tabnine file does not contain the
  final-review block; `AGENTS.md` section does not contain the completion
  checklist
- `CLAUDE.md` golden unchanged regression test

## Documentation Updates

- amend `phase-02/001` Output Contract table
- amend `phase-01/004` Content Contract section order
- future `docs/targets/tabnine.md`
- future `docs/targets/agents-md.md`
- `fixtures/README.md`

## Final Review Checklist

- conditional render rules are deterministic across both surfaces
- no schema changes
- no duplication of shared final-review or completion-checklist content
- Tabnine file size under 500 lines
- security contract matches the owning target on each surface
- `CLAUDE.md` is not modified
