# Spec: Tabnine Guidelines Target

## Status

Verified

Implemented in `packages/compiler` for the minimal fixture. Workflow and
stack-specific guideline files are emitted only when the relevant profile
workflow flag or stack value is present. The Phase 2 base contract was
verified on 2026-05-02. Phase 10 added conditional stack/workflow outputs.
Phase 18 added the `05-planning-workflow.md` output; the Phase 18 amendment
section below records when and why that file was added so the original Phase
2 verification date is not misread as covering the planning-workflow file.

## Problem

Tabnine Agent supports project guidelines as Markdown files under
`.tabnine/guidelines/`. The Phase 2 Tabnine target needs a spec for segmented
guidelines so the compiler does not collapse every instruction into one
monolithic file or duplicate generic context across artifacts.

## Goal

Generate deterministic, short, task-specific Tabnine guideline files from
validated `ai-profile.yaml` and derived `effectivePermissions`.

## Non-Goals

- implementing the Tabnine guidelines target
- generating Tabnine MCP configuration
- changing Tabnine IDE settings
- reading managed enterprise guideline policy
- generating Codex or Claude artifacts
- uploading source code or repository content

## User Flow

1. A user enables `clients.tabnine.enabled: true`.
2. A future compile command derives `effectivePermissions`.
3. The Tabnine guidelines target renders segmented Markdown files under
   `.tabnine/guidelines/`.
4. Golden tests compare every generated guideline file byte-for-byte.
5. A future doctor command checks drift and unsafe generated instructions.

## Inputs

- validated `AiProfile` from `001-profile-schema-v1.md`
- derived `effectivePermissions`
- compiler determinism contract from `003-compiler-determinism.md`
- golden test contract from `005-golden-test-harness.md`
- official Tabnine guidelines documentation verified during implementation

## Outputs

- target id: `tabnine-guidelines`
- generated project files (Phase 2 base contract; Phase 18 adds
  `05-planning-workflow.md` — see the Phase 18 amendment section below):
  - `.tabnine/guidelines/00-general-agent-behavior.md`
  - `.tabnine/guidelines/10-sdd-workflow.md`
  - `.tabnine/guidelines/20-tdd-workflow.md`
  - `.tabnine/guidelines/30-stack-typescript-svelte.md`
  - `.tabnine/guidelines/40-stack-java-spring.md`
  - `.tabnine/guidelines/50-testing-playwright-junit.md`
  - `.tabnine/guidelines/90-final-review.md`
- deterministic Tabnine guideline artifacts once implemented
- golden fixture outputs under
  `fixtures/minimal-valid/expected/.tabnine/guidelines/`

## Output Contract

The minimal fixture must emit these files:

| Output path                                          | Template id                                                |
| ---------------------------------------------------- | ---------------------------------------------------------- |
| `.tabnine/guidelines/00-general-agent-behavior.md`   | `targets/tabnine-guidelines/00-general-agent-behavior@1`   |
| `.tabnine/guidelines/10-sdd-workflow.md`             | `targets/tabnine-guidelines/10-sdd-workflow@1`             |
| `.tabnine/guidelines/20-tdd-workflow.md`             | `targets/tabnine-guidelines/20-tdd-workflow@1`             |
| `.tabnine/guidelines/30-stack-typescript-svelte.md`  | `targets/tabnine-guidelines/30-stack-typescript-svelte@1`  |
| `.tabnine/guidelines/40-stack-java-spring.md`        | `targets/tabnine-guidelines/40-stack-java-spring@1`        |
| `.tabnine/guidelines/50-testing-playwright-junit.md` | `targets/tabnine-guidelines/50-testing-playwright-junit@1` |
| `.tabnine/guidelines/90-final-review.md`             | `targets/tabnine-guidelines/90-final-review@1`             |

### Phase-10 Conditional Outputs

These outputs are additive amendments from phase 10 and are emitted only when
the corresponding gate is open. Absence of the gate emits nothing and produces
no warning.

| Output path                                        | Template id                                              | Gate                                |
| -------------------------------------------------- | -------------------------------------------------------- | ----------------------------------- |
| `.tabnine/guidelines/30-stack-typescript-react.md` | `targets/tabnine-guidelines/30-stack-typescript-react@1` | `stack.frameworks` contains `react` |
| `.tabnine/guidelines/60-code-review.md`            | `targets/tabnine-guidelines/60-code-review@1`            | `workflow.codeReview: true`         |
| `.tabnine/guidelines/70-refactoring.md`            | `targets/tabnine-guidelines/70-refactoring@1`            | `workflow.refactoring: true`        |
| `.tabnine/guidelines/80-documentation.md`          | `targets/tabnine-guidelines/80-documentation@1`          | `workflow.documentation: true`      |

### Phase-18 Amendment: Planning Workflow

Added by `docs/specs/phase-18/002-tabnine-planning-guideline.md`. This output
is additive and was not part of the Phase 2 verification on 2026-05-02; its
acceptance criteria live in the Phase 18 spec.

| Output path                                   | Template id                                         | Gate                                                     |
| --------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------- |
| `.tabnine/guidelines/05-planning-workflow.md` | `targets/tabnine-guidelines/05-planning-workflow@1` | `clients.tabnine.enabled: true` and `workflow.sdd: true` |

The guideline sits before `10-sdd-workflow.md` because clarification and
issue planning happen before implementation against an approved spec.

Generated Markdown must use:

- UTF-8
- LF line endings
- exactly one trailing newline
- no trailing whitespace
- stable section order
- generated-file header in every file

## Generated Artifact Shape

Each guideline file begins with:

```markdown
<!-- Generated by Agent Profile Compiler. Do not edit by hand. -->

# <guideline title>
```

The minimal fixture golden files are:

```text
fixtures/minimal-valid/expected/.tabnine/guidelines/
  00-general-agent-behavior.md
  05-planning-workflow.md
  10-sdd-workflow.md
  20-tdd-workflow.md
  30-stack-typescript-svelte.md
  40-stack-java-spring.md
  50-testing-playwright-junit.md
  90-final-review.md
```

## Target Mapping

Official Tabnine guideline docs, verified on 2026-05-02:

- URL: `https://docs.tabnine.com/main/getting-started/tabnine-agent/guidelines`
- project guideline directory: `.tabnine/guidelines/`
- guideline file type: Markdown (`.md`)
- multiple guideline files are supported
- Tabnine recommends hierarchical structure and guideline files of 500 lines or
  less

Mapping rules:

| Profile data                  | Guideline output                                    |
| ----------------------------- | --------------------------------------------------- |
| `profile`                     | `00-general-agent-behavior.md` project summary      |
| `workflow.sdd`                | `10-sdd-workflow.md` when true                      |
| `workflow.tdd`                | `20-tdd-workflow.md` when true                      |
| TypeScript/Svelte stack items | `30-stack-typescript-svelte.md` for the fixture     |
| Java/Spring stack items       | `40-stack-java-spring.md` for the fixture           |
| Playwright/JUnit test items   | `50-testing-playwright-junit.md` for the fixture    |
| `workflow.finalReview`        | `90-final-review.md` when true                      |
| `effectivePermissions`        | Safety instructions inside relevant guideline files |

Phase 18 adds one more row to this mapping via
`docs/specs/phase-18/002-tabnine-planning-guideline.md`:
`workflow.sdd` also emits `05-planning-workflow.md` when true.

Official-doc verification is a required implementation gate. If Tabnine changes
the documented guideline path, file type, or structural recommendations, update
this spec and the golden fixtures before writing target code.

## Contracts

- Generated Tabnine guidelines consume `effectivePermissions`.
- The target must not use raw `safety.mode` alone to choose permission wording.
- Generated files must be segmented by concern.
- Generated files must stay short and targeted.
- Generated files must not duplicate large generic context across artifacts.
- Output paths and template IDs are exactly those listed in the Output Contract.
- Golden tests compare exact output bytes, including exactly one trailing
  newline.
- The target must not generate fields or artifacts outside the approved schema
  and this spec.

## Security Rules

- Do not include literal secrets.
- Do not include environment variable values.
- Do not instruct Tabnine to upload source code.
- Do not grant production access.
- Do not instruct automatic dependency installation.
- Do not instruct unsafe auto-approval.
- Mutating filesystem operations, shell commands, dependency installation, and
  external network access must reflect `effectivePermissions`.

## Acceptance Criteria

- Tabnine guidelines target contract exists.
- Output paths and template IDs are concrete.
- Generated guideline files are segmented and deterministic.
- The minimal fixture has exact golden outputs under
  `fixtures/minimal-valid/expected/.tabnine/guidelines/`.
- Generated guideline files include generated-file headers.
- Generated instructions consume `effectivePermissions`.
- Generated instructions preserve local-first, no-secret, no-production-access,
  no-auto-install, and no-unsafe-auto-approval rules.
- Official-doc key/path verification is required before target implementation.

## Tests

- golden test for every minimal fixture guideline output
- output paths match the Output Contract exactly
- template IDs match the Output Contract exactly
- generated output has LF line endings and exactly one trailing newline
- generated output contains no literal secret-like values
- generated output contains no environment variable values
- generated output does not instruct source upload
- generated output does not instruct production access
- generated output does not instruct automatic dependency installation
- generated output reflects `effectivePermissions` for mutating, shell,
  dependency, network, secret, and production access

## Documentation Updates

- future `docs/targets/tabnine.md`
- `fixtures/README.md`
- `docs/research/004-best-practices-per-artifact.md`

## Fixture Paths

- input: `fixtures/minimal-valid/ai-profile.yaml`
- expected directory:
  `fixtures/minimal-valid/expected/.tabnine/guidelines/`
- target id assertion: `tabnine-guidelines`
- template id assertions: listed in the Output Contract

## Final Review Checklist

- required sections are present: problem, goal, non-goals, inputs, outputs,
  contracts, security rules, acceptance criteria, tests, documentation updates,
  final checklist
- output paths and template IDs are concrete
- generated artifact shapes are concrete enough for implementation and golden
  tests
- fixture paths and expected golden outputs are documented
- official-doc path verification is captured as an implementation gate
- guidelines are segmented by concern
- generated content stays short and targeted
- no secrets, production access, auto-install, source upload, or unsafe
  auto-approval are introduced
