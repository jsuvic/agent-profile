# Spec: Tabnine MCP Config Target

## Status

Verified

Implemented in `packages/compiler` for the minimal fixture. Verified on
2026-05-02 after final implementation review.

## Problem

Tabnine can use native tools and MCP servers, but runtime approval behavior is
controlled by Tabnine IDE settings. Agent Profile Compiler needs a target spec
that maps profile intent to Tabnine project artifacts without claiming it can
verify or enforce every IDE runtime setting.

## Goal

Define how the Tabnine target will map validated `ai-profile.yaml` input and
`effectivePermissions` into Tabnine project configuration and doctor guidance.

## Non-Goals

- implementing the Tabnine target
- changing Tabnine IDE settings
- reading managed enterprise settings
- installing MCP servers automatically
- generating non-Tabnine targets
- uploading project files or source code

## User Flow

1. A user enables `clients.tabnine.enabled: true`.
2. A future compile command generates Tabnine project artifacts from
   `effectivePermissions`.
3. A future doctor command compares generated/project config against the
   declared profile intent.
4. If actual Tabnine IDE permission state cannot be inspected, doctor reports
   "not verifiable" with manual verification guidance.

## Inputs

- validated `AiProfile` from `001-profile-schema-v1.md`
- derived `effectivePermissions`
- target mapping table from this spec
- future Tabnine template files
- future generated Tabnine project files such as `.tabnine/mcp_servers.json`

## Outputs

- target id: `tabnine-mcp-config`
- template id: `targets/tabnine-mcp-config@1`
- generated project file: `.tabnine/mcp_servers.json`
- deterministic Tabnine target artifacts once implemented
- doctor mapping guidance for Tabnine permission posture
- golden fixture output:
  `fixtures/minimal-valid/expected/.tabnine/mcp_servers.json`

## Output Contract

The Tabnine target must emit one generated file for the MVP:

| Field         | Value                                                       |
| ------------- | ----------------------------------------------------------- |
| target id     | `tabnine-mcp-config`                                        |
| template id   | `targets/tabnine-mcp-config@1`                              |
| output path   | `.tabnine/mcp_servers.json`                                 |
| fixture input | `fixtures/minimal-valid/ai-profile.yaml`                    |
| fixture gold  | `fixtures/minimal-valid/expected/.tabnine/mcp_servers.json` |

The generated file must use deterministic JSON formatting:

- UTF-8
- LF line endings
- two-space indentation
- exactly one trailing newline
- stable key order

## Generated Artifact Shape

For `fixtures/minimal-valid/ai-profile.yaml`, the exact golden output is:

```json
{
  "mcpServers": {}
}
```

This shape is intentionally empty because the MVP profile schema does not yet
define MCP server declarations and this target must not auto-install or
auto-enable third-party MCP servers. Future MCP entries may only use the
documented Tabnine server fields listed in this spec.

## Target Mapping

Tabnine native tool and MCP permissions may be controlled by IDE settings.
Generated files can express intended posture and MCP configuration, but actual
IDE permission state may be unverifiable from repository files alone.

Verified Tabnine project config surface:

Verification date for this spec revision: 2026-05-02.

- project MCP file: `.tabnine/mcp_servers.json`
- optional user-level MCP file: `~/.tabnine/mcp_servers.json`
- top-level MCP key: `mcpServers`
- stdio server keys: `command`, `args`, `env`, `cwd`
- streamable HTTP server keys: `url`, `requestInit`, `sessionId`
- legacy SSE server keys: `transport: "sse"`, `url`, `requestInit`,
  `eventSourceInit`, `authProvider`
- native tool and MCP permission UI values: Auto-approve, Ask first, Disable

Verified source URLs:

- `https://docs.tabnine.com/main/getting-started/tabnine-agent/mcp-intro-and-setup`
- `https://docs.tabnine.com/main/getting-started/tabnine-agent/agent-settings`

The current official docs use the UI labels `Auto-approve`, `Ask first`, and
`Disable`. If Tabnine changes these labels, update this spec and the target
docs before changing generated guidance.

The MCP docs prose includes a singular `mcp_server` phrase, but the documented
JSON examples and actual top-level object use `mcpServers`. This target must
emit `mcpServers`.

The docs describe MCP server configuration fields but not a repository-file
field that pins per-server approval mode. The implementation must therefore not
invent a permission key inside `.tabnine/mcp_servers.json` unless a later
official doc adds one.

Official-doc verification is captured as a required implementation gate:

- Before implementing this target, re-check the current Tabnine MCP and agent
  settings docs.
- If documented keys differ from this spec, update this spec and golden
  fixtures before writing target code.
- When implementation begins, every key emitted by the generator must have a
  source URL and verification date captured in this spec.
- Do not ship generated keys that are inferred from UI behavior but absent from
  documented project-file configuration.

Mapping rules:

| `effectivePermissions` field | Tabnine intent mapping                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------ |
| `filesystem.read`            | allow read-only project context where supported                                                  |
| `filesystem.write`           | map `ask` to Ask first; map `deny` to Disable; map `allow` only when safety policy permits       |
| `shell.run`                  | map `ask` to Ask first; map `deny` to Disable; auto-approve only under autonomous sandbox policy |
| `dependencies.install`       | treat as shell/package-manager execution; default to Ask first or Disable                        |
| `network.external`           | map to MCP/tool permission guidance where supported; otherwise not verifiable                    |
| `secrets.access`             | always deny; generated config must not grant secret reads                                        |
| `production.access`          | always deny; generated config must not grant production access                                   |

Doctor must provide manual verification guidance when runtime permissions cannot
be inspected through project files.

## Contracts

- Generated Tabnine artifacts consume `effectivePermissions`.
- The target must not use raw `safety.mode` alone to choose permission behavior.
- Generated files must not claim to enforce IDE permission settings that are
  controlled by Tabnine.
- Generated `.tabnine/mcp_servers.json` uses `mcpServers` and only documented
  server fields.
- Tabnine permission mode is treated as not verifiable from project files unless
  a documented project-file key becomes available.
- Auto-approval for dangerous tools is forbidden unless
  `safety.mode: autonomous` and `safety.requiresSandbox: true`.
- Actual IDE permission state may be reported as "not verifiable".
- The target must not install or enable third-party MCP servers automatically.
- The generated file path is exactly `.tabnine/mcp_servers.json`.
- The generated template id is exactly `targets/tabnine-mcp-config@1`.
- The MVP generated artifact shape is exactly the JSON object shown above for
  the minimal fixture.
- Golden tests compare exact output bytes, including formatting and final
  newline.

## Security Rules

- Do not upload source code.
- Do not read or print secrets.
- Do not write literal tokens into Tabnine config.
- Do not grant secrets or production access.
- Do not silently generate dangerous auto-approval.
- Do not generate unsafe auto-approval for native tools or MCP tools.
- Do not auto-install MCP servers.
- Do not generate production API endpoints or production access defaults.
- Do not mutate IDE settings.

## Acceptance Criteria

- Tabnine target mapping distinguishes profile intent, generated config, and
  actual IDE runtime state.
- Generated artifacts use `effectivePermissions`.
- Runtime IDE permission state that cannot be inspected is reported as "not
  verifiable".
- Dangerous auto-approval follows the autonomous sandbox rule.
- Secrets and production access remain deny-only.
- Manual verification guidance is documented.
- Output path, target id, and template id match the Output Contract.
- The minimal fixture has an exact golden output at
  `fixtures/minimal-valid/expected/.tabnine/mcp_servers.json`.
- The generated artifact shape is concrete enough for implementation and golden
  tests.
- Official-doc key verification is required before target implementation.

## Tests

- guarded profile maps write, shell, dependency install, and network to ask or
  deny intent
- autonomous profile without sandbox intent is rejected by doctor
- secrets and production access never map to allow
- generated output is deterministic
- "not verifiable" runtime state produces doctor guidance
- no generated artifact contains literal secret-like values
- golden test writes only `.tabnine/mcp_servers.json` for the minimal fixture
- golden test records template id `targets/tabnine-mcp-config@1`
- golden test asserts exact bytes for
  `fixtures/minimal-valid/expected/.tabnine/mcp_servers.json`
- fixture output does not contain `command`, `args`, `env`, `url`, or
  auto-approval keys unless a future profile field explicitly requests a
  reviewed MCP server

## Documentation Updates

- future `docs/targets/tabnine.md`
- `docs/security/trust-model.md`
- `docs/security/secret-handling.md`

## Fixture Paths

- input: `fixtures/minimal-valid/ai-profile.yaml`
- expected output: `fixtures/minimal-valid/expected/.tabnine/mcp_servers.json`
- target id assertion: `tabnine-mcp-config`
- template id assertion: `targets/tabnine-mcp-config@1`

## Final Review Checklist

- required sections are present: problem, goal, non-goals, inputs, outputs,
  contracts, security rules, acceptance criteria, tests, documentation updates,
  final checklist
- output path and template id are concrete
- generated artifact shape is concrete enough for implementation and golden
  tests
- fixture paths and expected golden output are documented
- official-doc key verification is captured as an implementation gate
- generated/project config does not overclaim runtime enforcement
- mapping uses `effectivePermissions`
- manual verification guidance is clear
- no MCP server is installed automatically
- secrets and production access remain denied
