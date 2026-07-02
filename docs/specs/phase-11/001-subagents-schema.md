# Spec: Subagents Schema

## Status

Draft. Lifted from `phase-later/002-subagents-targets.md` on 2026-05-16. Not
approved. Owns the schema-side contract for Phase 11.

## Problem

`capabilities.delegation.subagents.enabled` is reserved in
`phase-01/001-profile-schema-v1.md` but not live. Without a concrete,
client-neutral subagent intent shape, the three target specs in this phase
(`002`, `003`, `004`) cannot be implemented without leaking target-specific
fields into the canonical profile.

## Goal

Define the live shape of `capabilities.delegation.subagents`, the validation
contract, and the canonical-purity rules that keep target-specific knobs out of
`ai-profile.yaml`. Define the per-target compilation rules at a level the three
target specs can consume without redefining the schema.

## Non-Goals

- defining each target's exact output bytes (owned by `002`, `003`, `004`)
- defining doctor checks (owned by `005`)
- launching, invoking, or testing subagents at compile or doctor time
- generating global/user-level subagents
- generating managed/admin/org-level subagents
- generating Claude hooks, memory, worktree isolation, background mode,
  inline MCP servers, or skills preload
- defining the MCP server reference shape (owned by
  `phase-later/008-mcp-server-declaration-schema.md`)
- changing workflow-skill targets in `phase-03/004` or `phase-03/005`

## User Flow

1. A user enables subagent generation in `ai-profile.yaml` using
   `capabilities.delegation.subagents`.
2. The user defines one or more named subagent intents with description,
   purpose, system prompt, model preference, limits, and client-neutral tool
   scope.
3. `agent-profile compile --dry-run` previews generated project-local subagent
   files for enabled clients.
4. `agent-profile compile --write` writes only lockfile-tracked project files.
5. The compiler never starts the clients and never invokes the generated
   subagents.
6. `agent-profile doctor` validates schema, generated artifacts, drift, and
   unsafe broadening per `005-doctor-subagent-checks.md`.

## Inputs

- validated `AiProfile` from `phase-01/001-profile-schema-v1.md`
- derived `effectivePermissions`
- compiler determinism contract from `phase-01/003-compiler-determinism.md`
- lockfile contract from `phase-01/002-lockfile-v1.md`
- current official Claude, Codex, and Tabnine subagent docs verified before
  each target implementation

## Schema Shape

`capabilities.delegation.subagents` is lifted from reserved to live by this
phase. The amendment to `phase-01/001-profile-schema-v1.md` must replace the
reserved single-field shape with the following:

```yaml
capabilities:
  delegation:
    subagents:
      enabled: true
      defaults:
        maxConcurrent: 3
        maxDepth: 1
      agents:
        - name: code-reviewer
          description: Use for focused code review before handoff.
          purpose: Review changed code for correctness, security, tests, and spec compliance.
          prompt: |
            Review changed code. Report only actionable findings with severity,
            affected file or symbol, and the smallest safe remediation.
          toolScope: read-only
          modelPreference: inherit
          maxTurns: 10
          timeoutMinutes: 5
          mcpServers: []
```

### Field Contracts

| Field                                        | Type    | Required           | Contract                                                                |
| -------------------------------------------- | ------- | ------------------ | ----------------------------------------------------------------------- |
| `capabilities.delegation.subagents.enabled`  | boolean | yes                | defaults to `false` when the `capabilities` block is present            |
| `capabilities.delegation.subagents.defaults` | object  | no                 | conservative defaults applied to Codex `[agents]` block                 |
| `defaults.maxConcurrent`                     | integer | no                 | positive integer; omitted means use compiler default `3`                |
| `defaults.maxDepth`                          | integer | no                 | positive integer; omitted means use compiler default `1`                |
| `capabilities.delegation.subagents.agents`   | array   | yes when `enabled` | non-empty when `enabled: true`                                          |
| `agents[].name`                              | string  | yes                | matches `^[a-z0-9][a-z0-9-]*$`                                          |
| `agents[].description`                       | string  | yes                | non-empty; routing hint shown to the parent agent                       |
| `agents[].purpose`                           | string  | yes                | non-empty; human-readable summary; not emitted verbatim by every target |
| `agents[].prompt`                            | string  | yes                | non-empty; mapped to each target's system-prompt body or field          |
| `agents[].toolScope`                         | string  | yes                | one of `read-only`, `workspace-write`                                   |
| `agents[].modelPreference`                   | string  | no                 | one of `inherit`, `fast`, `balanced`, `capable`                         |
| `agents[].maxTurns`                          | integer | no                 | positive integer                                                        |
| `agents[].timeoutMinutes`                    | integer | no                 | positive integer                                                        |
| `agents[].mcpServers`                        | array   | no                 | references only; see MCP rule below                                     |

### Naming and Collision Rules

- `name` is the canonical identity used for filenames and ids in all three
  targets.
- The compiler must reject duplicate names after target-specific normalization
  (lowercase, hyphen and underscore folded). Two intents that normalize to the
  same id are a schema error, not a per-target warning.
- The compiler must reject names that collide with known built-ins unless a
  later approved override policy exists. Built-ins to reject or warn on:
  - Codex: `default`, `worker`, `explorer`
  - Claude: `explore`, `plan`, `general-purpose`
  - Tabnine: `codebase_investigator`, `remote-codebase-investigator`,
    `generalist`, `browser_agent`
- Collision checks normalize hyphen and underscore differences where target
  docs use both styles.
- Severity for built-in collisions belongs to
  `005-doctor-subagent-checks.md` (`LINT-SUBAGENT-005`). Schema validation may
  hard-reject when a name is identical pre-normalization to a built-in.

### Canonical Purity

The canonical profile must not contain target-specific fields. The following
are forbidden in `agents[]` entries and must be rejected by schema validation:

- Claude raw frontmatter keys, including but not limited to `permissionMode`,
  `disallowedTools`, `hooks`, `memory`, `isolation`, `background`, `effort`,
  `color`, `initialPrompt`, `skills`.
- Codex raw TOML keys, including but not limited to `sandbox_mode`,
  `nickname_candidates`, `model_reasoning_effort`, `developer_instructions`,
  `mcp_servers`, `skills.config`.
- Tabnine raw frontmatter keys, including but not limited to `kind`, `tools`,
  `temperature`, `max_turns`, `timeout_mins`.
- Target-specific model identifiers such as `claude-3-5-sonnet`, `o4-mini`,
  or any vendor model id. Use `modelPreference` instead.

Target-specific values are produced by the per-target generators in `002`,
`003`, and `004`, not by the canonical schema.

### MCP Server References

- `mcpServers` is optional and may contain string references only.
- Inline MCP server definitions, literal tokens, env values, bearer tokens, and
  inline credentials are always forbidden in `agents[].mcpServers`.
- The compiler must treat `mcpServers` as schema-rejected with a clear error
  message until `phase-later/008-mcp-server-declaration-schema.md` is approved
  and a top-level MCP reference table exists. An empty list (`[]`) is allowed.

## Outputs

This spec defines no generated files. It defines:

- the live schema shape
- the validation rules
- the target-neutral compilation inputs (`name`, `description`, `prompt`,
  `toolScope`, `modelPreference`, `maxTurns`, `timeoutMinutes`,
  `mcpServers`, plus `defaults.maxConcurrent` and `defaults.maxDepth` for the
  Codex `[agents]` block)

`002`, `003`, and `004` consume this list and add target id, output path,
template id, and exact byte-level output contracts.

## Cross-Phase Amendments

Required before implementation of any target in this phase:

- `phase-01/001-profile-schema-v1.md`: replace the reserved
  `capabilities.delegation.subagents.enabled` block with the live shape above.
  Add validation tests for required-when-enabled, duplicate names, invalid
  name formats, target-specific raw fields, and forbidden MCP shapes.
- `phase-01/003-compiler-determinism.md`: add `claude-subagents`,
  `codex-subagents`, and `tabnine-subagents` to `CompilerTargetId`.
- `phase-03/001-codex-config-target.md`: accept the additive `[agents]` block
  defined in `003-codex-subagents-target.md` without changing existing
  guarded-output bytes for the minimal fixture.
- `phase-04/001-doctor-lockfile-drift.md`: extend orphan and drift detection
  to cover generated subagent artifacts.
- `phase-04/003-doctor-permission-mode-checks.md`: extend to validate subagent
  tool and sandbox fields against `effectivePermissions`.
- `phase-04/005-doctor-security-checks.md`: include subagent artifacts in
  secret-pattern, source-upload, and unsafe-instruction checks without
  printing file contents.
- `phase-04/006-doctor-skill-checks.md`: explicitly exclude subagent files;
  parallel checks live in `005-doctor-subagent-checks.md`.
- `phase-05/005-import-existing-artifacts.md`: keep existing third-party or
  manually authored subagents as manual-review imports.
- `phase-later/008-mcp-server-declaration-schema.md`: hard prereq for any
  non-empty `mcpServers` reference.

## Contracts

- Subagents require explicit opt-in (`enabled: true`).
- `agents` is required and non-empty when `enabled: true`.
- The canonical profile carries no target-specific knobs.
- Duplicate names after normalization are a schema error, not a per-target
  warning.
- `mcpServers` is empty or schema-rejected until `phase-later/008` is approved.
- Generated output consumes `effectivePermissions`, not raw `safety.mode`.
- `defaults.maxConcurrent` and `defaults.maxDepth` apply to the Codex
  `[agents]` block. If omitted, the compiler uses `3` and `1` respectively to
  keep generated delegation conservative — not Codex's larger upstream
  defaults.

## Security Rules

- Do not execute, invoke, or spawn subagents during compile, validation,
  import, or doctor checks.
- Do not install dependencies, extensions, plugins, MCP servers, browser
  helpers, or skills.
- Do not embed secrets, environment variable values, tokens, bearer headers,
  or production endpoints in the schema or its error messages.
- Do not accept target-specific fields in the canonical profile. Reject with a
  deterministic error that names the field path.
- Do not silently coerce unknown fields. Unknown keys under
  `capabilities.delegation.subagents` are a schema error.

## Acceptance Criteria

- `capabilities.delegation.subagents` is concretely defined and client-neutral.
- All field types, required-status, regexes, and defaults are listed.
- Built-in collision lists for Claude, Codex, and Tabnine are enumerated.
- Canonical purity rule rejects target-specific fields by name.
- `mcpServers` is constrained to empty or already-approved secret-free
  references.
- Conservative defaults for `maxConcurrent` and `maxDepth` are stated.
- Cross-phase amendments are listed with the specific change required in each.

## Tests

- schema validation accepts a minimal `subagents-enabled` fixture with one
  valid `read-only` agent
- schema rejects `enabled: true` with empty or missing `agents`
- schema rejects duplicate names pre-normalization
- schema rejects duplicate names that normalize to the same id (hyphen vs.
  underscore folded)
- schema rejects names not matching `^[a-z0-9][a-z0-9-]*$`
- schema rejects target-specific raw fields:
  `permissionMode`, `sandbox_mode`, `tools`, `developer_instructions`,
  `kind`, `disallowedTools`, `hooks`, `memory`, `model_reasoning_effort`
- schema rejects vendor model identifiers in `modelPreference`
- schema rejects non-empty `mcpServers` until `phase-later/008` is approved
- schema rejects unknown keys under `capabilities.delegation.subagents`
- schema rejects names colliding pre-normalization with documented built-ins
  for all three targets
- omitted `defaults.maxConcurrent` resolves to `3`; omitted
  `defaults.maxDepth` resolves to `1`
- schema validation errors include the JSON Pointer of the offending field and
  no source or secret content

## Documentation Updates

- amend `docs/specs/phase-01/001-profile-schema-v1.md`
- amend `docs/specs/phase-01/003-compiler-determinism.md`
- update `docs/research/006-client-capability-matrix.md` once approved
- future `docs/targets/claude.md`, `docs/targets/codex.md`,
  `docs/targets/tabnine.md`
- `fixtures/README.md` once the `subagents-enabled` fixture lands

## Fixture Paths

- input: `fixtures/subagents-enabled/ai-profile.yaml`
- expected lockfile: `fixtures/subagents-enabled/expected/ai-profile.lock`

Per-target expected outputs are listed in `002`, `003`, and `004`.

## Final Review Checklist

- the live schema replaces the reserved block in `phase-01/001`
- field contracts are concrete enough for schema codegen
- canonical purity rule is enforced by tests
- built-in collision lists are current against verified target docs
- `mcpServers` deferral matches `phase-later/008` ownership
- conservative defaults are still stricter than Codex's upstream defaults
- cross-phase amendments are listed and traceable
- no target output bytes are defined in this spec

## Phase 12 Amendment (2026-07-02)

The optional unique `subagents.packs` array accepts `reviewer-subagents`.
Pack-only profiles are valid when `enabled: true`; enabled intent requires at
least one non-empty source (`agents` or `packs`). Pack expansion participates in
the same name-collision, target-enablement, permission, and deterministic render
pipeline as inline/template agents.
