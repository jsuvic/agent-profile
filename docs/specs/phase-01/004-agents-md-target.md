# Spec: AGENTS.md Target

## Status

Verified

Implemented in `packages/compiler` with a golden fixture at
`fixtures/minimal-valid/expected/AGENTS.md`. Verified on 2026-05-02 after final
implementation review.

## Problem

The first useful compiler output is a deterministic `AGENTS.md` file generated
from the canonical profile. This proves the profile-to-output path before adding
Tabnine, Codex, Claude skills, or MCP configuration.

## Goal

Generate repository-root `AGENTS.md` from a validated `ai-profile.yaml` for the
`agents-md` target.

## Non-Goals

- generating `CLAUDE.md`
- generating Tabnine guidelines
- generating Codex or Claude skills
- generating MCP configuration
- writing files without diff-before-write
- adding custom skills beyond future MVP skill specs
- supporting Cursor, Aider, Copilot, or enterprise features

## User Flow

1. A user creates a valid `ai-profile.yaml`.
2. A future compile command runs with `--target agents-md --dry-run`.
3. The compiler previews the generated `AGENTS.md` bytes.
4. Golden tests compare the output to
   `fixtures/minimal-valid/expected/AGENTS.md`.
5. A future non-dry-run mode writes only after showing a diff.

## Inputs

- validated `AiProfile` from `001-profile-schema-v1.md`
- derived `effectivePermissions`
- `agents-md` target template
- compiler determinism contract from `003-compiler-determinism.md`

## Outputs

```ts
const generatedFile = {
  path: "AGENTS.md",
  target: "agents-md",
  templateId: "targets/agents-md@1",
  bytes: Uint8Array,
  sha256: "<sha256 of bytes>",
};
```

## Content Contract

The generated Markdown sections are ordered exactly:

1. `# AGENTS.md`
2. `## Project`
3. `## Stack`
4. `## Enabled AI Clients`
5. `## Development Workflow`
6. `## Permissions`
7. `## Safety Rules`
8. `## Scope Limits`
9. `## Completion Checklist`

The generated file must use LF line endings and exactly one trailing newline.

### Phase-10 Conditional Sections

The following sections are additive amendments from phase 10. They are
inserted at the stable positions below only when their gate is open; absence
of the gate emits nothing, with no warning, and preserves the fixed order of
the nine sections above.

| Section title               | Insertion position                                                            | Gate                                |
| --------------------------- | ----------------------------------------------------------------------------- | ----------------------------------- |
| `## Stack Guidance — React` | immediately after `## Stack`                                                  | `stack.frameworks` contains `react` |
| `## Code Review`            | immediately after `## Development Workflow`                                   | `workflow.codeReview: true`         |
| `## Refactoring`            | immediately after `## Code Review` if present, else `## Development Workflow` | `workflow.refactoring: true`        |
| `## Documentation`          | immediately after `## Refactoring`/`## Code Review`/`## Development Workflow` | `workflow.documentation: true`      |

## Rendering Rules

### Project

Uses:

- `profile.name`
- `profile.description`

The description is rendered as text, not interpreted as Markdown control flow.

### Stack

Render stack arrays in this fixed order:

1. languages
2. frameworks
3. package managers
4. testing

Array values are rendered in profile order after schema validation. Empty arrays
render as `None declared`.

### Enabled AI Clients

Client render order is fixed:

1. Tabnine
2. Codex
3. Claude

Only clients with `enabled: true` are listed as enabled. Disabled clients must
not appear in the enabled list. If no clients are enabled, render:

```text
No AI clients are enabled in this profile.
```

### Development Workflow

Render the three workflow fields:

- SDD
- TDD
- final implementation review

Each field renders as `Required` when `true` and `Not required` when `false`.

### Permissions

Render a Markdown table with rows in this fixed order:

1. filesystem read
2. filesystem write
3. shell run
4. dependency install
5. external network
6. secrets access
7. production access

Values are the exact permission modes from `effectivePermissions`, not raw
`safety.mode` alone.

### Safety Rules

Always include:

- no source-code upload
- no secret upload
- no literal tokens in generated configs
- no telemetry by default
- no hosted execution in the MVP

### Scope Limits

Always state that Cursor, Aider, Copilot, hosted gateways, enterprise RBAC, SIEM
integrations, and custom sandbox runtimes are out of scope unless an approved
spec adds them.

### Completion Checklist

Always include:

- run tests
- run golden tests when generated files change
- run doctor/check once available
- review implementation against the relevant spec
- list remaining risks or TODOs

## Example Fragment

For the minimal fixture, the enabled client section begins:

```markdown
## Enabled AI Clients

- Tabnine
- Codex
- Claude
```

## Failure Modes

This target uses `CompileIssue` from `003-compiler-determinism.md`.

Target-specific issue expectations:

- disabled explicit `agents-md` target is not possible in schema v1 because
  `AGENTS.md` is the cross-client repo instruction target.
- unsafe generated content uses `code: "unsafe_generated_content"` and
  `path: "AGENTS.md"`.
- invalid output path uses `code: "invalid_output_path"` and `path:
"AGENTS.md"`.

## Contracts

- `AGENTS.md` output is deterministic for the same profile and template.
- Output path is exactly `AGENTS.md`.
- Template ID is `targets/agents-md@1`.
- Generated content must not claim support for disabled clients.
- Generated content must not include unsupported targets as supported.
- Generated content must not introduce fields outside
  `001-profile-schema-v1.md`.
- Generated content must use `effectivePermissions`.
- Generated content must follow `003-compiler-determinism.md`.
- Generated output is governed by `005-golden-test-harness.md`.

## Security Rules

- Do not include literal secrets.
- Do not include environment variable values.
- Shell execution must be rendered from `effectivePermissions` and should
  normally be ask/deny.
- Mutating filesystem/dependency operations must be rendered from
  `effectivePermissions` and should normally be ask/deny.
- Do not suggest source upload, telemetry, hosted execution, or hosted MCP
  gateway behavior.

## Acceptance Criteria

- `agents-md` target contract exists.
- Output path is exactly `AGENTS.md`.
- Output template ID is `targets/agents-md@1`.
- Output content is deterministic.
- Output sections and section order match this spec.
- Output reflects enabled clients and workflow flags from the profile.
- Output reflects permissions from `effectivePermissions`.
- Output preserves local-first and no-secret safety rules.
- Output has a golden fixture.

## Tests

- golden test for `fixtures/minimal-valid/ai-profile.yaml`
- output path is exactly `AGENTS.md`
- template ID is exactly `targets/agents-md@1`
- disabled client does not appear in enabled clients
- no enabled clients renders the specified fallback
- generated output contains SDD/TDD/final-review values
- generated output contains the `effectivePermissions` table in fixed row order
- generated output contains safety rules
- generated output contains scope limits
- generated output has LF line endings
- generated output has exactly one trailing newline
- generated output has no literal secret-like values
- generated output does not contain environment variable values

## Fixture Paths

Current fixture:

```text
fixtures/minimal-valid/ai-profile.yaml
fixtures/minimal-valid/expected/AGENTS.md
```

## Documentation Updates

- `README.md`
- future `docs/targets/agents-md.md` or target reference section
- `fixtures/README.md`

## Final Review Checklist

- generated text matches the profile contract
- section order is stable
- disabled clients are handled correctly
- no unsupported target claims are introduced
- security rules are explicit
- golden fixture changes are intentional
- contracts align with `003-compiler-determinism.md` and
  `005-golden-test-harness.md`

## Phase 12 Amendment (2026-07-02)

When Codex or Claude is enabled, review intent is rendered as the generated
`review-change` skill and the standalone `## Code Review` guidance section is
omitted to avoid duplicate instructions. Tabnine-only profiles may retain the
shared guidance section while Tabnine receives its umbrella guideline.
