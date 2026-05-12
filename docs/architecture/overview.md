# Architecture Overview

Agent Profile Compiler is a local-first npm workspace monorepo.

## Product Layers

### Cognitive Layer

Defines how agents should reason and work.

Planned outputs:

- `AGENTS.md`
- `CLAUDE.md`
- `.tabnine/guidelines/*.md`
- `.agents/skills/*/SKILL.md` (Codex; current official Codex skill path)
- `.claude/skills/*/SKILL.md`

### Infrastructure Layer

Defines which local tools agents can use.

Initial planned outputs:

- `.tabnine/mcp_servers.json`
- `.codex/config.toml`

The MVP supports local, config-only MCP generation. STDIO is the safest default
transport where supported, but STDIO is not the only forever-supported
transport: target specs already document HTTP/streamable HTTP and legacy SSE
keys for clients that support them. The compiler must not auto-install
third-party MCP servers in MVP.

Later outputs may include Docker MCP, ToolHive, or gateway configuration, but
remote MCP, hosted gateways, registry-based installation, and custom sandbox
runtime work are later, explicit-opt-in capabilities and out of MVP scope.

### Governance Layer

Validates that generated files are safe and in sync.

Planned commands:

- `agent-profile doctor`
- `agent-profile check`

Deferred commands:

- standalone `agent-profile diff`

Governance checks compare profile intent, generated config, and any detectable
client runtime settings. Runtime permission enforcement remains controlled by
Tabnine, Codex, Claude, or the surrounding sandbox.

### Knowledge Layer

Future repo-local SDD artifacts may live under an optional `.sdlc/` workspace.
The MVP does not implement cloud memory, hosted embeddings, or a dedicated
knowledge MCP/tool/agent.

## Client Capability Model

`ai-profile.yaml` describes client-neutral intent. Target adapters compile that
intent into the supported artifacts for each client.

Codex, Claude, and Tabnine expose different extension surfaces. Codex and
Claude currently support richer advanced capabilities such as hooks, subagents,
and plugins. Tabnine remains focused in the MVP on Guidelines, MCP
configuration, and permission guidance until equivalent advanced capabilities
are verified from official documentation.

Unsupported capabilities must be reported explicitly as not supported or not
generated. Target adapters must not silently ignore requested capabilities, and
they must not claim cross-client support for features that only some targets
support.

## Workspace Packages

- `apps/cli`: CLI entrypoint.
- `apps/web`: local loopback UI for project inspection and guarded
  `ai-profile.yaml` editing.
- `packages/core`: shared contracts and domain types.
- `packages/scanner`: local config-file stack detection.
- `packages/compiler`: deterministic profile-to-output compiler.
- `packages/doctor`: drift and safety checks.
- `packages/templates`: output templates.
- `packages/schemas`: published profile schemas.

## Data Flow

```text
repository files
  -> scanner
  -> ai-profile.yaml
  -> schema validation
  -> safety intent
  -> compiler
  -> generated agent files
  -> doctor/drift checks
```

Browser profile editing uses a narrower server path:

```text
/profile form
  -> POST /api/profile/plan
  -> @agent-profile/core validation + secret checks
  -> diff@9 unified diff + server-side plan token
  -> POST /api/profile/apply
  -> fixed-profile atomic write helper
  -> ai-profile.yaml
```

This path never writes generated artifacts, lockfiles, package files, shell
commands, or arbitrary browser-supplied paths.

## Initial Non-Goals

- hosted source scanning
- hosted MCP gateway
- credential brokerage
- custom sandbox runtime
- enterprise RBAC
- telemetry by default
- Cursor, Aider, or Copilot output targets
