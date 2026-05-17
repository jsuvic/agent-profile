# Spec: Subagents Targets

## Status

Superseded by `docs/specs/phase-11/` on 2026-05-16.

This file is kept as the historical umbrella for the subagents work. All
binding contracts now live in the numbered Phase 11 specs:

- `docs/specs/phase-11/README.md`
- `docs/specs/phase-11/001-subagents-schema.md`
- `docs/specs/phase-11/002-claude-subagents-target.md`
- `docs/specs/phase-11/003-codex-subagents-target.md`
- `docs/specs/phase-11/004-tabnine-subagents-target.md`
- `docs/specs/phase-11/005-doctor-subagent-checks.md`

The Phase 11 specs are themselves Draft and not approved. Do not implement
from either this file or the Phase 11 specs until each phase-11 spec is
Approved and the cross-phase amendments listed in `phase-11/001` are in.

Previous status was: Draft for a later phase. Phase 11 candidate. Not
approved.

Research re-checked on 2026-05-15. The earlier assumption that Tabnine has no
native subagent surface is no longer correct for Tabnine CLI: Tabnine now
documents custom subagents under `.tabnine/agent/agents/*.md`, but marks the
feature experimental and warns that subagents may execute tools without
per-action confirmation.

Implementation, if approved, should start on branch `jsu/subagents`.

## Problem

Claude, Codex, and Tabnine now all document subagent or custom-agent concepts,
but their paths, file formats, field names, permission inheritance, and runtime
enablement semantics differ.

Without a target-specific spec, Agent Profile Compiler could:

- generate subagents that silently broaden tool access
- confuse workflow skills with delegated agents
- emit artifacts that are not tracked in the lockfile
- treat experimental Tabnine behavior as equivalent to safer Codex or Claude
  surfaces
- leak target-specific fields into the canonical `ai-profile.yaml`

## Goal

Define a client-neutral subagent intent shape and deterministic project-local
generation contracts for:

- Claude project subagents
- Codex project custom agents
- Tabnine CLI project custom subagents

The phase must preserve the product principles: local-first output, no source
upload, no secret upload, deterministic generation, and safety checks as part
of the feature.

## Non-Goals

- launching, invoking, or testing subagents at compile or doctor time
- installing third-party subagent packages, extensions, plugins, MCP servers,
  skills, or dependencies
- generating global/user-level subagents
- generating managed/admin/org-level subagents
- generating Claude hooks, memory, worktree isolation, or inline MCP servers
- generating Codex CSV fan-out workflows
- generating Tabnine extension packages
- changing workflow skill targets in `phase-03/004` or `phase-03/005`
- adding Cursor, Aider, Copilot, or enterprise features

## User Flow

1. A user enables subagent generation in `ai-profile.yaml` using the future
   `capabilities.delegation.subagents` block.
2. The user defines one or more named subagent intents with description,
   purpose, system prompt, model preference, limits, and client-neutral tool
   scope.
3. `agent-profile compile --dry-run` previews generated project-local
   subagent files for enabled clients.
4. `agent-profile compile --write` writes only lockfile-tracked project files.
5. The user starts Claude, Codex, or Tabnine normally. The compiler never
   starts the clients and never invokes the generated subagents.
6. `agent-profile doctor` checks generated subagent artifacts for drift,
   unsafe broadening, target-specific schema problems, and orphan generated
   files.

For Tabnine, the first implementation will enable the experimental
runtime switch. Users can edit Tabnine custom subagents manually in
`.tabnine/agent/settings.json` or a future approved target-specific settings
spec must opt into that write explicitly.

## Inputs

- validated `AiProfile`
- future schema patch for `capabilities.delegation.subagents`
- derived `effectivePermissions`
- compiler determinism contract from `phase-01/003-compiler-determinism.md`
- lockfile contract from `phase-01/002-lockfile-v1.md`
- doctor permission checks from
  `phase-04/003-doctor-permission-mode-checks.md`
- current official Claude, Codex, and Tabnine subagent docs verified before
  implementation

## Proposed Schema Shape

`phase-01/001-profile-schema-v1.md` currently reserves
`capabilities.delegation.subagents.enabled` only. A numbered phase must amend
that reserved block into a live, strict schema.

Proposed additive shape:

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

Schema contracts:

- `capabilities.delegation.subagents.enabled` defaults to `false` when the
  future `capabilities` block is present.
- `agents` is required and non-empty when `enabled: true`.
- `name` uses stable lowercase kebab-case:
  `^[a-z0-9][a-z0-9-]*$`.
- `description`, `purpose`, and `prompt` are required non-empty strings.
- `toolScope` is required and is one of `read-only` or `workspace-write`.
- `modelPreference` is optional and one of `inherit`, `fast`, `balanced`, or
  `capable`.
- `maxTurns` and `timeoutMinutes` are optional positive integers.
- `mcpServers` is optional and may contain references only. Inline MCP server
  definitions require `phase-later/008-mcp-server-declaration-schema.md` or a
  later approved spec.
- The canonical profile must not contain raw Claude `permissionMode`, Codex
  `sandbox_mode`, Tabnine `tools`, or target-specific model IDs.
- The compiler must reject duplicate names after target-specific normalization.
- The compiler must reject names that collide with known built-ins unless a
  later approved override policy exists.

## Outputs

This phase adds three subagent targets and one additive Codex config
amendment:

| Target id                | Output path pattern                      | Ownership               |
| ------------------------ | ---------------------------------------- | ----------------------- |
| `claude-subagents`       | `.claude/agents/<name>.md`               | new target              |
| `codex-subagents`        | `.codex/agents/<name>.toml`              | new target              |
| `tabnine-subagents`      | `.tabnine/agent/agents/<name>.md`        | new target              |
| `codex-config` amendment | `[agents]` block in `.codex/config.toml` | owned by `phase-03/001` |

Tabnine runtime enablement is not emitted in the first implementation:

- no `.tabnine/agent/settings.json` write is part of this spec
- doctor may report informational guidance when Tabnine subagent files exist
  but `experimental.enableAgents` is not visible in project settings
- a future spec may add a separate target-specific settings write after the
  safety implications are accepted

## Output Contract

For fixture `fixtures/subagents-enabled/ai-profile.yaml`, the target set must
emit:

| Output path                              | Target id           | Template id                                 |
| ---------------------------------------- | ------------------- | ------------------------------------------- |
| `.claude/agents/code-reviewer.md`        | `claude-subagents`  | `targets/claude-subagents/code-reviewer@1`  |
| `.codex/agents/code-reviewer.toml`       | `codex-subagents`   | `targets/codex-subagents/code-reviewer@1`   |
| `.tabnine/agent/agents/code-reviewer.md` | `tabnine-subagents` | `targets/tabnine-subagents/code-reviewer@1` |

The same fixture must amend the existing `.codex/config.toml` golden output
owned by `codex-config` to include:

```toml
[agents]
max_threads = 3
max_depth = 1
```

If `defaults.maxConcurrent` is omitted, the compiler uses `3`, not Codex's
larger upstream default, to keep generated delegation conservative. If
`defaults.maxDepth` is omitted, the compiler uses `1`.

All generated artifacts must use:

- UTF-8
- LF line endings
- exactly one trailing newline
- no trailing whitespace
- stable key and section order
- the generated-file header where the target format supports comments without
  changing semantics

## Generated Artifact Shape

For the proposed `code-reviewer` fixture, exact golden output must be defined
before implementation. The first revision should use these shapes unless
current target docs require an update.

Claude:

```markdown
---
name: code-reviewer
description: Use for focused code review before handoff.
tools: Read, Glob, Grep
model: inherit
permissionMode: plan
maxTurns: 10
---

<!-- Generated by Agent Profile Compiler. Do not edit by hand. -->

# Code Reviewer

Review changed code. Report only actionable findings with severity,
affected file or symbol, and the smallest safe remediation.
```

Codex:

```toml
# Generated by Agent Profile Compiler. Do not edit by hand.

name = "code-reviewer"
description = "Use for focused code review before handoff."
sandbox_mode = "read-only"
developer_instructions = """
Review changed code. Report only actionable findings with severity,
affected file or symbol, and the smallest safe remediation.
"""
```

Tabnine:

```markdown
---
name: code-reviewer
description: Use for focused code review before handoff.
kind: local
tools:
  - read_file
  - grep_search
max_turns: 10
timeout_mins: 5
---

<!-- Generated by Agent Profile Compiler. Do not edit by hand. -->

# Code Reviewer

Review changed code. Report only actionable findings with severity,
affected file or symbol, and the smallest safe remediation.
```

Generation rules:

- `modelPreference: inherit` omits Codex and Tabnine model fields where the
  target inherits by omission.
- `toolScope: read-only` must not emit write, edit, shell, browser, dependency,
  network, production, or secret-capable tools.
- `toolScope: workspace-write` is allowed only when `effectivePermissions`
  permits workspace writes and must still keep shell, dependency installation,
  external network, secrets, and production access no looser than
  `effectivePermissions`.
- Empty `mcpServers` emits no target MCP fields.

## Verified Target Mapping

Verification date: 2026-05-15.

| Target      | Native surface    | Project path                 | Format                      | Confidence                            | Notes                                                                                                    |
| ----------- | ----------------- | ---------------------------- | --------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Claude      | yes               | `.claude/agents/*.md`        | Markdown + YAML frontmatter | high                                  | project subagents are documented and higher priority than user/plugin scopes                             |
| Codex       | yes               | `.codex/agents/*.toml`       | TOML                        | high                                  | built-ins are `default`, `worker`, and `explorer`; custom names can shadow built-ins                     |
| Tabnine CLI | yes, experimental | `.tabnine/agent/agents/*.md` | Markdown + YAML frontmatter | high for existence, medium for safety | docs require explicit `experimental.enableAgents`; docs warn about current no-confirmation tool behavior |

Verified source URLs:

- `https://code.claude.com/docs/en/sub-agents`
- `https://developers.openai.com/codex/subagents`
- `https://docs.tabnine.com/main/getting-started/tabnine-cli/features/subagents`
- `https://docs.tabnine.com/main/getting-started/tabnine-cli/features/settings`

## Target Mapping Rules

### Claude

Officially verified surface:

- project path: `.claude/agents/`
- user path exists but is out of scope
- Markdown files with YAML frontmatter
- required fields: `name`, `description`
- body is the subagent system prompt
- optional fields include `tools`, `disallowedTools`, `model`,
  `permissionMode`, `mcpServers`, `hooks`, `maxTurns`, `skills`,
  `initialPrompt`, `memory`, `effort`, `background`, `isolation`, and `color`
- subagents inherit parent tool access by default unless restricted
- `permissionMode: bypassPermissions` bypasses prompts and must not be
  generated
- parent `bypassPermissions`, `acceptEdits`, and `auto` modes can override or
  ignore subagent frontmatter

Mapping:

| Profile data                 | Claude output                                                                 |
| ---------------------------- | ----------------------------------------------------------------------------- |
| `name`                       | frontmatter `name` and filename `<name>.md`                                   |
| `description`                | frontmatter `description`                                                     |
| `prompt`                     | Markdown body after generated-file header                                     |
| `toolScope: read-only`       | `tools: Read, Glob, Grep` and `permissionMode: plan`                          |
| `toolScope: workspace-write` | no `bypassPermissions`; write tools only if allowed by `effectivePermissions` |
| `modelPreference: inherit`   | `model: inherit`                                                              |
| `maxTurns`                   | frontmatter `maxTurns`                                                        |
| `mcpServers`                 | string references only, after `phase-later/008` is approved                   |

The first implementation must not emit Claude hooks, memory, worktree
isolation, background mode, inline MCP server definitions, or skills preload.

### Codex

Officially verified surface:

- project path: `.codex/agents/`
- user path exists but is out of scope
- one standalone TOML file per custom agent
- required fields: `name`, `description`, `developer_instructions`
- optional fields include `nickname_candidates`, `model`,
  `model_reasoning_effort`, `sandbox_mode`, `mcp_servers`, and
  `skills.config`
- subagents inherit the current sandbox policy
- runtime overrides such as `/approvals` changes or `--yolo` are reapplied to
  child agents
- global settings live under `[agents]` in `.codex/config.toml`
- `agents.max_threads`, `agents.max_depth`, and
  `agents.job_max_runtime_seconds` are documented global settings
- a custom name matching a built-in takes precedence

Mapping:

| Profile data                 | Codex output                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------ |
| `name`                       | `name` and filename `<name>.toml`                                              |
| `description`                | `description`                                                                  |
| `prompt`                     | `developer_instructions`                                                       |
| `toolScope: read-only`       | `sandbox_mode = "read-only"`                                                   |
| `toolScope: workspace-write` | `sandbox_mode = "workspace-write"` only when allowed by `effectivePermissions` |
| `modelPreference: inherit`   | omit `model` and `model_reasoning_effort`                                      |
| `defaults.maxConcurrent`     | `[agents].max_threads` in `.codex/config.toml`                                 |
| `defaults.maxDepth`          | `[agents].max_depth` in `.codex/config.toml`                                   |
| `mcpServers`                 | `[mcp_servers.<id>]` references only after `phase-later/008` is approved       |

The first implementation must not emit `sandbox_mode = "danger-full-access"`,
`approval_policy = "never"`, `skills.config`, absolute user skill paths, CSV
fan-out jobs, or inline MCP credentials.

### Tabnine CLI

Officially verified surface:

- project path: `.tabnine/agent/agents/*.md`
- user path exists but is out of scope
- Markdown files with YAML frontmatter
- required fields: `name`, `description`
- optional fields include `kind`, `tools`, `model`, `temperature`,
  `max_turns`, and `timeout_mins`
- custom subagents require `experimental.enableAgents: true` in
  `settings.json`
- project settings path is `.tabnine/agent/settings.json`
- the docs currently mark subagents experimental and warn that subagents may
  execute tools without per-action confirmation

Mapping:

| Profile data                 | Tabnine output                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| `name`                       | frontmatter `name` and filename `<name>.md`                                                        |
| `description`                | frontmatter `description`                                                                          |
| `prompt`                     | Markdown body after generated-file header                                                          |
| `toolScope: read-only`       | `tools: [read_file, grep_search]`                                                                  |
| `toolScope: workspace-write` | deferred until Tabnine exposes safer confirmation semantics or a phase explicitly accepts the risk |
| `modelPreference: inherit`   | omit `model`                                                                                       |
| `maxTurns`                   | `max_turns`                                                                                        |
| `timeoutMinutes`             | `timeout_mins`                                                                                     |

The first implementation must generate only read-only Tabnine subagents. It
must not emit `run_shell_command`, `write_file`, browser-agent settings,
extension references, or `.tabnine/agent/settings.json`.

## Permission and Inheritance Semantics

- Generated subagents must narrow or preserve `effectivePermissions`; they must
  never broaden them.
- Runtime flags and client-managed settings can override generated files.
  Doctor must report unverifiable or broader runtime state honestly instead of
  claiming enforcement.
- The compiler must never generate secret access, production access, broad
  shell access, automatic dependency installation, or source-upload
  instructions.
- MCP server references are allowed only after the MCP declaration schema
  defines secret-free references and lockfile identity. Literal tokens, env
  values, bearer tokens, and inline credentials are always forbidden.
- Target-specific tool lists must be allowlists for the minimum required
  surface. Omitted tool fields that imply full inherited access are forbidden
  for generated read-only agents.

## Unsafe Subagent Findings

Doctor must add a subagent check family before this target is marked verified.
Suggested issue codes:

| Code                | Severity | Condition                                                                                                                    |
| ------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `LINT-SUBAGENT-001` | error    | generated subagent grants a tool or permission looser than `effectivePermissions`                                            |
| `LINT-SUBAGENT-002` | error    | generated or project subagent contains literal secret-like values or inline credential material                              |
| `LINT-SUBAGENT-003` | error    | generated Codex subagent uses `danger-full-access`                                                                           |
| `LINT-SUBAGENT-004` | error    | generated Claude subagent uses `bypassPermissions`                                                                           |
| `LINT-SUBAGENT-005` | warning  | generated subagent name collides with known built-in names                                                                   |
| `LINT-SUBAGENT-006` | warning  | generated subagent file exists on disk but is no longer claimed by current compile output and lockfile                       |
| `LINT-SUBAGENT-007` | warning  | Tabnine subagent uses write, shell, browser, or network-capable tools while the feature remains experimental/no-confirmation |
| `LINT-SUBAGENT-008` | info     | target runtime enablement cannot be verified, such as Tabnine `experimental.enableAgents`                                    |

Known built-in collisions to reject or warn on:

- Codex: `default`, `worker`, `explorer`
- Claude: `explore`, `plan`, `general-purpose`
- Tabnine: `codebase_investigator`, `remote-codebase-investigator`,
  `generalist`, `browser_agent`

Collision checks must normalize hyphen and underscore differences where target
docs use both styles.

## Removal and Drift Behavior

Subagent outputs are generated artifacts and must be lockfile-tracked.

Doctor must detect:

- missing generated subagent files listed in `ai-profile.lock`
- changed bytes for lockfile-listed generated subagent files
- current compile outputs absent from the lockfile
- generated subagent files under supported roots that contain the generated
  header but are no longer produced by the current profile

Doctor must not print subagent file contents in findings.

## Cross-Phase Contracts

- `phase-01/001-profile-schema-v1.md` must be amended before implementation
  to make `capabilities.delegation.subagents` live.
- `phase-01/002-lockfile-v1.md` applies unchanged, but fixtures must prove
  subagent outputs are tracked.
- `phase-01/003-compiler-determinism.md` must add the three target ids to the
  allowed descriptor target union.
- `phase-02/001-tabnine-guidelines-target.md` remains separate. Tabnine
  subagents are not guideline emulation and must use `.tabnine/agent/agents/`.
- `phase-03/001-codex-config-target.md` owns `.codex/config.toml`; this phase
  may only amend it additively with an `[agents]` block.
- `phase-03/002-claude-config-target.md` owns project Claude settings. Claude
  subagent files may not weaken settings-level permission guards.
- `phase-03/004-codex-workflow-skills-target.md` keeps subagents out of
  workflow skills. `codex-subagents` is a separate target id.
- `phase-03/005-claude-workflow-skills-target.md` keeps subagents out of
  workflow skills. `claude-subagents` is a separate target id.
- `phase-04/001-doctor-lockfile-drift.md` must be extended for orphan
  generated subagent artifacts.
- `phase-04/003-doctor-permission-mode-checks.md` must be extended to validate
  subagent tool and sandbox fields against `effectivePermissions`.
- `phase-04/005-doctor-security-checks.md` must include subagent artifacts in
  secret-pattern, source-upload, and unsafe-instruction checks without printing
  file contents.
- `phase-04/006-doctor-skill-checks.md` should not absorb subagent checks.
  Create parallel doctor checks for `.claude/agents/`, `.codex/agents/`, and
  `.tabnine/agent/agents/`.
- `phase-05/005-import-existing-artifacts.md` must keep existing third-party
  or manually authored subagents as manual-review imports unless a later spec
  defines safe adoption.
- `phase-later/008-mcp-server-declaration-schema.md` blocks MCP server
  references beyond empty lists or already-approved secret-free references.

## Contracts

- Subagents require explicit opt-in.
- Project-local output is the only supported output scope.
- Unsupported, disabled, or unsafe target behavior must produce deterministic
  warnings or errors, not silent omission.
- A subagent intent that is valid for one target but unsupported by another
  must produce a deterministic per-target not-generated result.
- Generated subagent names, paths, and template ids are deterministic.
- Generated output consumes `effectivePermissions`, not raw `safety.mode`.
- Generated subagents must be deterministic byte-for-byte for the same profile.
- Generated subagents must be tracked in `ai-profile.lock`.
- Existing user-authored subagents must not be overwritten unless lockfile
  ownership proves they were generated by Agent Profile Compiler.
- Codex global `[agents]` settings must be merged deterministically through the
  existing `codex-config` target owner.
- Tabnine custom subagent runtime enablement remains manual until a later spec
  explicitly accepts or mitigates the experimental no-confirmation behavior.

## Security Rules

- Do not execute, invoke, or spawn subagents during compile, validation,
  import, or doctor checks.
- Do not install dependencies, extensions, plugins, MCP servers, browser
  helpers, or skills.
- Do not embed secrets, environment variable values, tokens, bearer headers, or
  production endpoints.
- Do not generate source-upload instructions.
- Do not grant production access.
- Do not generate unsafe auto-approval.
- Do not generate Codex `danger-full-access`.
- Do not generate Claude `bypassPermissions`.
- Do not generate Tabnine `run_shell_command` or `write_file` while Tabnine
  subagents remain experimental/no-confirmation.
- Do not emit global, user, managed, admin, or plugin subagent files.

## Acceptance Criteria

- target support is documented with verification date, source URLs, path,
  format, and confidence
- user research contradiction is resolved: Tabnine has a native experimental
  CLI subagent surface
- future schema shape is concrete and client-neutral
- output target ids, paths, and template ids are listed
- generated artifact shapes are concrete enough for golden tests
- Codex `[agents]` ownership and merge boundary are explicit
- Tabnine runtime enablement decision is explicit and safety-driven
- doctor unsafe-subagent findings are defined
- lockfile drift and orphan behavior are defined
- cross-phase amendments are listed
- implementation remains out of MVP until a numbered phase approves it

## Tests

- schema validation for enabled subagents with one valid `read-only` agent
- schema rejection for duplicate names and invalid name formats
- schema rejection for target-specific raw fields in canonical profile
- golden tests for `claude-subagents`, `codex-subagents`, and
  `tabnine-subagents`
- Codex config golden test for additive `[agents]` block
- absence-of-output test when subagents are disabled
- disabled-client target rejection tests using `disabled_target`
- deterministic LF/trailing-newline tests
- generated frontmatter/TOML parse tests
- no secret-like values in generated outputs
- no source-upload, production-access, dependency-install, or unsafe
  auto-approval wording in generated outputs
- negative test that Codex output never emits `danger-full-access`
- negative test that Claude output never emits `bypassPermissions`
- negative test that Tabnine output never emits `run_shell_command` or
  `write_file`
- Tabnine `toolScope: workspace-write` produces a deterministic not-generated
  or safety error result while the feature remains experimental/no-confirmation
- doctor tests for every `LINT-SUBAGENT-*` code
- lockfile orphan generated-subagent test
- built-in name collision tests for all three targets

## Documentation Updates

- amend `docs/specs/phase-01/001-profile-schema-v1.md`
- amend `docs/specs/phase-01/003-compiler-determinism.md`
- amend `docs/specs/phase-03/001-codex-config-target.md`
- amend `docs/specs/phase-04/001-doctor-lockfile-drift.md`
- amend `docs/specs/phase-04/003-doctor-permission-mode-checks.md`
- add a new doctor subagent-check spec in `phase-04` or the numbered
  implementation phase
- update `docs/research/006-client-capability-matrix.md`
- future `docs/targets/claude.md`
- future `docs/targets/codex.md`
- future `docs/targets/tabnine.md`
- `fixtures/README.md`

## Fixture Paths

- input: `fixtures/subagents-enabled/ai-profile.yaml`
- expected Claude output:
  `fixtures/subagents-enabled/expected/.claude/agents/code-reviewer.md`
- expected Codex output:
  `fixtures/subagents-enabled/expected/.codex/agents/code-reviewer.toml`
- expected Tabnine output:
  `fixtures/subagents-enabled/expected/.tabnine/agent/agents/code-reviewer.md`
- expected Codex config amendment:
  `fixtures/subagents-enabled/expected/.codex/config.toml`
- lockfile fixture:
  `fixtures/subagents-enabled/expected/ai-profile.lock`

## Phase Placement Recommendation

This should become a numbered phase only if the implementation owner accepts
the coordinated schema, compiler, doctor, lockfile, Codex config, and target
documentation work. The phase is now substantial enough to justify
`phase-11/` instead of a loose future note because all three first targets have
native documented surfaces.

If it remains in `phase-later/`, this file should be treated as the umbrella
spec. A numbered phase may split it into:

- `001-subagents-schema.md`
- `002-claude-subagents-target.md`
- `003-codex-subagents-target.md`
- `004-tabnine-subagents-target.md`
- `005-doctor-subagent-checks.md`

## Final Review Checklist

- official target docs were re-checked before implementation
- Tabnine's current experimental/no-confirmation warning is still represented
- generated artifacts are project-local only
- generated artifacts are lockfile-tracked
- no subagents are executed by compile or doctor
- target behavior is independently specified
- workflow skills and subagents remain separate targets
- Codex config ownership is respected
- no secrets, production access, source upload, dependency auto-install, or
  unsafe auto-approval are introduced
