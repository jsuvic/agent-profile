# Spec: Claude Config Target

## Status

Verified

Implemented in `packages/compiler` for the minimal fixture. Verified on
2026-05-02 after final implementation review.

## Problem

Claude Code supports permission modes and allow/ask/deny rules, but actual CLI
flags and user settings can override project configuration. Agent Profile
Compiler needs a Claude target spec that maps profile intent to project config
without generating unsafe defaults or overclaiming runtime enforcement.

## Goal

Define the Claude target mapping contract for settings concepts such as
`defaultMode` plus allow/ask/deny rules.

## Non-Goals

- implementing the Claude target
- changing live Claude CLI flags or user settings
- generating `bypassPermissions` as a project default
- installing MCP servers automatically
- generating Tabnine or Codex artifacts
- adding cloud memory or hosted execution

## User Flow

1. A user enables `clients.claude.enabled: true`.
2. A future compile command derives `effectivePermissions`.
3. The Claude target maps `effectivePermissions` to project settings where
   supported.
4. Doctor reports generated config that is looser than profile intent and
   reports runtime mode as "not verifiable" when CLI flags or user settings
   cannot be inspected.

## Inputs

- validated `AiProfile` from `001-profile-schema-v1.md`
- derived `effectivePermissions`
- Claude target mapping table from this spec
- current official Claude docs verified during implementation
- future generated Claude project settings

## Outputs

- target ids: `claude-settings`, `claude-mcp`
- template ids: `targets/claude-settings@1`, `targets/claude-mcp@1`
- generated project files: `.claude/settings.json`, `.mcp.json`
- deterministic Claude project config once implemented
- doctor findings for unsafe or unverifiable permission posture
- golden fixture outputs:
  `fixtures/minimal-valid/expected/.claude/settings.json` and
  `fixtures/minimal-valid/expected/.mcp.json`

## Output Contract

The Claude target must emit two generated files for the MVP:

| Field         | Settings file                                           | MCP file                                    |
| ------------- | ------------------------------------------------------- | ------------------------------------------- |
| target id     | `claude-settings`                                       | `claude-mcp`                                |
| template id   | `targets/claude-settings@1`                             | `targets/claude-mcp@1`                      |
| output path   | `.claude/settings.json`                                 | `.mcp.json`                                 |
| fixture input | `fixtures/minimal-valid/ai-profile.yaml`                | `fixtures/minimal-valid/ai-profile.yaml`    |
| fixture gold  | `fixtures/minimal-valid/expected/.claude/settings.json` | `fixtures/minimal-valid/expected/.mcp.json` |

Generated JSON files must use deterministic formatting:

- UTF-8
- LF line endings
- two-space indentation
- exactly one trailing newline
- stable key order

## Generated Artifact Shape

For `fixtures/minimal-valid/ai-profile.yaml` with guarded effective
permissions, the exact `.claude/settings.json` golden output is:

```json
{
  "permissions": {
    "defaultMode": "default",
    "allow": [],
    "ask": ["Bash", "Edit", "Write", "WebFetch"],
    "deny": [
      "Read(./.env)",
      "Read(./.env.*)",
      "Read(./secrets/**)",
      "Read(./**/secrets/**)"
    ],
    "disableBypassPermissionsMode": "disable",
    "disableAutoMode": "disable"
  },
  "sandbox": {
    "enabled": true,
    "failIfUnavailable": false,
    "autoAllowBashIfSandboxed": false
  }
}
```

For the same fixture, the exact `.mcp.json` golden output is:

```json
{
  "mcpServers": {}
}
```

The `.mcp.json` shape is intentionally empty because the MVP profile schema
does not yet define MCP server declarations and this target must not
auto-install or auto-enable third-party MCP servers.

## Target Mapping

Exact generated values below are verified against official Claude docs before
implementation of this target begins.

Verified Claude project config surface:

Verification date for this spec revision: 2026-05-02.

- shared project settings path: `.claude/settings.json`
- local project settings path: `.claude/settings.local.json`
- project MCP path: `.mcp.json`
- permission object key: `permissions`
- permission rule arrays: `permissions.allow`, `permissions.ask`,
  `permissions.deny`
- permission mode key: `permissions.defaultMode`
- valid `defaultMode` values: `default`, `acceptEdits`, `plan`, `auto`,
  `dontAsk`, `bypassPermissions`
- bypass guard key: `permissions.disableBypassPermissionsMode`
- auto guard key: `permissions.disableAutoMode`
- additional file access key: `permissions.additionalDirectories`
- sandbox object key: `sandbox`
- sandbox keys: `sandbox.enabled`, `sandbox.failIfUnavailable`,
  `sandbox.autoAllowBashIfSandboxed`, `sandbox.excludedCommands`,
  `sandbox.allowUnsandboxedCommands`
- sandbox filesystem keys: `sandbox.filesystem.allowWrite`,
  `sandbox.filesystem.denyWrite`, `sandbox.filesystem.denyRead`,
  `sandbox.filesystem.allowRead`,
  `sandbox.filesystem.allowManagedReadPathsOnly`
- sandbox network keys: `sandbox.network.allowedDomains`,
  `sandbox.network.deniedDomains`, `sandbox.network.allowUnixSockets`,
  `sandbox.network.allowAllUnixSockets`, `sandbox.network.allowLocalBinding`,
  `sandbox.network.allowMachLookup`, `sandbox.network.allowManagedDomainsOnly`,
  `sandbox.network.httpProxyPort`, `sandbox.network.socksProxyPort`
- weaker sandbox flags: `sandbox.enableWeakerNestedSandbox`,
  `sandbox.enableWeakerNetworkIsolation`
- rule precedence: deny rules, then ask rules, then allow rules; first match
  wins
- array merge behavior: array-valued settings such as `permissions.allow` and
  `sandbox.filesystem.allowWrite` are concatenated and deduplicated across
  settings scopes
- permission rule path syntax: `/path` is project-root-relative, `//path` is
  absolute, `~/path` is home-relative, and `./path` or no prefix is
  current-directory-relative
- sandbox filesystem path syntax differs from permission rule syntax:
  single-slash `/path` is absolute, `~/path` is home-relative, and `./path` or
  no prefix is project-root-relative for project settings
- documented bare permission tool names include `Read`, `Edit`, and `Write`

Verified source URLs:

- `https://code.claude.com/docs/en/settings`
- `https://code.claude.com/docs/en/permissions`
- `https://code.claude.com/docs/en/permission-modes`

Conceptual mapping:

| Safety/effective permission | Claude config concept                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| `guarded`                   | default prompt-before-action behavior plus ask/deny rules                                   |
| `balanced`                  | edit-friendly mode only where file edits are intended; risky shell/network remains ask/deny |
| `autonomous`                | may map to a looser mode only with sandbox intent; never `bypassPermissions` by default     |
| `plan-only`                 | plan/read-only behavior where supported                                                     |
| filesystem write `ask`      | ask rule or default prompting for edit/write tools                                          |
| filesystem write `deny`     | deny rule for edit/write tools where supported                                              |
| shell/dependency `ask`      | ask rule for shell/package-manager commands                                                 |
| network `ask`/`deny`        | ask/deny WebFetch or network-capable tools where supported                                  |
| secrets/production `deny`   | deny rules and no generated access grants                                                   |

Claude permission and sandbox settings are cross-wired at runtime. Doctor and
target implementation must evaluate the effective surface across both sections:

- `Edit(...)` allow rules can expand `sandbox.filesystem.allowWrite`.
- `Read(...)` deny rules can expand `sandbox.filesystem.denyRead`.
- `sandbox.filesystem.allowWrite`, `sandbox.filesystem.denyWrite`,
  `sandbox.filesystem.allowRead`, `sandbox.filesystem.denyRead`, and
  `sandbox.network.*` can make the runtime surface looser or tighter than the
  visible permission rule arrays alone.
- Weaker sandbox flags and broad network settings must be treated as loosening
  the runtime surface unless a future approved policy states otherwise.
- Rule evaluation must account for deny -> ask -> allow precedence.
- Project, local, user, and managed scopes can merge arrays rather than replace
  them, so doctor must distinguish generated config from actual merged runtime
  state.

The compiler must not generate `bypassPermissions` as a project default.
It should set `permissions.disableBypassPermissionsMode` to `"disable"` in
guarded and plan-only generated project settings unless a later approved policy
decides otherwise.

Official-doc verification is captured as a required implementation gate:

- Before implementing this target, re-check the current official Claude
  settings, permissions, permission modes, sandboxing, and MCP docs.
- If documented keys or rule syntax differ from this spec, update this spec and
  golden fixtures before writing target code.
- When implementation begins, every key and rule string emitted by the generator
  must have a source URL and verification date captured in this spec.
- Do not emit rule strings, sandbox keys, auto-mode guards, or MCP server fields
  unless their exact keys and value shapes are verified against current official
  docs.

Actual Claude CLI flags, session mode changes, IDE settings, or user settings
can override project settings. Doctor must report unverifiable runtime state
honestly instead of claiming safety.

## Contracts

- Generated Claude artifacts consume `effectivePermissions`.
- The target must not use raw `safety.mode` alone to decide generated config.
- The target must not generate `bypassPermissions` as a project default.
- Generated `.claude/settings.json` uses only the verified keys listed in this
  spec.
- `plan-only` maps to plan/read-only behavior where supported.
- Exact settings keys and values must be verified against official Claude docs
  before implementation.
- Runtime overrides are reported as "not verifiable" unless actually inspected.
- The generated file paths are exactly `.claude/settings.json` and `.mcp.json`.
- The generated template ids are exactly `targets/claude-settings@1` and
  `targets/claude-mcp@1`.
- The MVP generated artifact shapes are exactly the JSON objects shown above
  for the minimal fixture.
- Golden tests compare exact output bytes, including formatting and final
  newline.
- The lockfile must map output path `.claude/settings.json` to target id
  `claude-settings` and template id `targets/claude-settings@1`.
- The lockfile must map output path `.mcp.json` to target id `claude-mcp` and
  template id `targets/claude-mcp@1`.

## Security Rules

- Do not generate permission bypass defaults.
- Do not generate `defaultMode: "bypassPermissions"` for any profile.
- Do not omit `permissions.disableBypassPermissionsMode: "disable"` from
  guarded or plan-only generated project settings unless a later approved spec
  changes the policy.
- Do not generate unsafe auto-approval.
- Do not grant secrets or production access.
- Do not embed environment variable values.
- Do not upload source code.
- Do not install dependencies or MCP servers.
- Do not auto-install third-party MCP servers.
- Do not generate production API endpoints or production access defaults.
- Do not claim runtime enforcement beyond generated/project config.

## Acceptance Criteria

- Claude target mapping covers `defaultMode` plus allow/ask/deny rules.
- Generated artifacts use `effectivePermissions`.
- `bypassPermissions` is never generated as a project default.
- `plan-only` maps to plan/read-only behavior where supported.
- Dangerous auto-approval requires autonomous sandbox intent.
- Secrets and production access remain deny-only.
- Unverifiable runtime state is reported as "not verifiable".
- Output paths, target ids, and template ids match the Output Contract.
- The minimal fixture has exact golden outputs at
  `fixtures/minimal-valid/expected/.claude/settings.json` and
  `fixtures/minimal-valid/expected/.mcp.json`.
- The generated artifact shapes are concrete enough for implementation and
  golden tests.
- Official-doc key verification is required before target implementation.

## Tests

- guarded profile maps shell/dependency/network to ask/deny posture
- plan-only maps edits and shell execution to deny/read-only behavior
- generated config never contains `bypassPermissions` as a project default
- autonomous without sandbox intent fails doctor
- generated config looser than `effectivePermissions` produces doctor finding
- runtime state unavailable produces "not verifiable" guidance
- generated output is deterministic
- generated output contains no literal secret-like values
- golden test writes only `.claude/settings.json` and `.mcp.json` for the
  minimal fixture
- golden test records template ids `targets/claude-settings@1` and
  `targets/claude-mcp@1`
- golden tests assert exact bytes for
  `fixtures/minimal-valid/expected/.claude/settings.json` and
  `fixtures/minimal-valid/expected/.mcp.json`
- golden tests assert the generated settings do not contain
  `bypassPermissions`, production endpoints, env values, non-empty MCP servers,
  or auto-install commands
- negative test asserts `Write` remains intentionally emitted only when current
  official docs still document it as a bare permission tool name
- doctor/target tests evaluate Claude rule precedence: deny -> ask -> allow
- doctor/target tests evaluate merged permission and sandbox arrays across
  generated, local, user, and managed scopes where those files are available
- doctor/target tests detect permissive `sandbox.filesystem.allowWrite` and
  `sandbox.network.allowedDomains` entries that make config looser than
  `effectivePermissions`

## Documentation Updates

- future `docs/targets/claude.md`
- `docs/security/trust-model.md`
- `docs/specs/phase-04/003-doctor-permission-mode-checks.md`

## Fixture Paths

- input: `fixtures/minimal-valid/ai-profile.yaml`
- expected settings output:
  `fixtures/minimal-valid/expected/.claude/settings.json`
- expected MCP output: `fixtures/minimal-valid/expected/.mcp.json`
- target id assertions: `claude-settings`, `claude-mcp`
- template id assertions: `targets/claude-settings@1`,
  `targets/claude-mcp@1`

## Final Review Checklist

- required sections are present: problem, goal, non-goals, inputs, outputs,
  contracts, security rules, acceptance criteria, tests, documentation updates,
  final checklist
- output paths and template ids are concrete
- generated artifact shapes are concrete enough for implementation and golden
  tests
- fixture paths and expected golden outputs are documented
- official-doc key verification is captured as an implementation gate
- official Claude docs were checked before implementation
- generated config avoids permission bypass defaults
- mapping uses `effectivePermissions`
- runtime overrides are not treated as fully verifiable unless inspected
- secrets and production access stay denied
