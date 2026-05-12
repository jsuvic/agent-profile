# ADR 0005: Client Capability Model

## Status

Accepted for planning.

## Context

Agent Profile Compiler targets multiple AI coding clients. Those clients expose
different extension surfaces and do not use one shared vocabulary.

Recent documentation review shows that Codex supports project instructions,
memories, skills, MCP, hooks, subagents, and plugins. Claude Code supports
CLAUDE.md/settings, skills, MCP, hooks, subagents, and plugins. Tabnine supports
Guidelines, MCP configuration, native/MCP tool permissions, and
enterprise/admin controls, but equivalent hooks, subagents, and plugins are not
confirmed.

The product must not become Claude-specific, Codex-specific, or
Tabnine-specific. It needs one client-neutral `ai-profile.yaml` and target
adapters that compile only the capabilities each client can support.

## Decision

Use a client-neutral capability model.

The compiler represents user intent in neutral capability categories. Each
target adapter decides whether that capability can be generated for the target,
must be reported as unsupported, or must be skipped with an explicit
not-generated message.

Hooks, subagents, and plugins are advanced client capabilities, not Claude-only
features. Codex and Claude currently have official support for some or all of
these advanced capabilities. Tabnine support for equivalent hooks, subagents,
and plugins is unknown/not supported until verified from official Tabnine
documentation.

The compiler must not claim cross-client support for features that only some
targets support.

## Capability Categories

- `instructions/memory`: project instructions, global/user instructions, and
  memory-like durable guidance.
- `skills`: task-specific reusable workflow instructions.
- `tools/MCP`: local tool and MCP configuration.
- `automation/hooks`: event-triggered automation surfaces.
- `delegation/subagents`: named delegated agent roles or subagent definitions.
- `distribution/plugins`: packaged extensions or installable plugin bundles.
- `runtime permissions/safety modes`: intended approval, sandbox, and
  permission posture.
- `knowledge/SDD artifacts`: repo-local specifications, decisions,
  assumptions, and project context.

## MVP Scope

MVP includes:

- project instructions
- workflow skills:
  - `sdd-change`
  - `tdd-change`
  - `final-review`
- basic MCP config
- runtime safety intent
- doctor/linter
- lockfile

MVP excludes:

- hooks
- subagents
- plugin packaging
- global memory writes
- dedicated knowledge MCP/tool
- automatic third-party MCP installation

## MCP MVP Posture

The MVP supports local, config-only MCP generation. STDIO is the safest
default transport for local MCP servers and should be preferred wherever the
target client supports it. STDIO is not the only transport the product will
ever support: target docs already record HTTP/streamable HTTP and legacy SSE
transport keys for clients that document them, and later phases may emit
those when there is an approved target spec.

Remote MCP, hosted MCP gateways, and registry-based or auto-installed MCP
servers are out of MVP scope. They are later, explicit-opt-in capabilities
and require their own approved specs before generation is allowed.

Project-local outputs are the default. Global/user-level outputs require
explicit opt-in and a dedicated spec.

## Later Scope

Later phases may add hooks, subagents, plugin packaging, richer memory support,
or a local knowledge tool/MCP surface. Each advanced capability requires a
target-specific spec before implementation.

Advanced capability specs must define separate behavior for Codex, Claude, and
Tabnine. If a target has no confirmed official support, the spec must mark that
target as `unknown` or `not-supported` and the adapter must report that clearly.

## Capability Confidence Levels

Capability support must be documented with one of these labels:

| Label                | Meaning                                                      |
| -------------------- | ------------------------------------------------------------ |
| `confirmed-official` | Verified in official client documentation for the target.    |
| `partial-official`   | Official docs confirm part of the capability, with limits.   |
| `unknown`            | Not verified from official docs. Do not generate by default. |
| `not-supported`      | Official docs or target behavior indicate no support.        |

Implementation specs must record the official source and verification date for
any `confirmed-official` or `partial-official` capability before generation is
implemented.

## Alternatives Considered

- Model capabilities per client only. Rejected because it would make
  `ai-profile.yaml` target-specific and harder to reason about.
- Treat Claude's richer surfaces as the product model. Rejected because hooks,
  subagents, and plugins are not Claude-only concepts.
- Generate all requested capabilities and let unsupported targets ignore them.
  Rejected because silent ignores make safety and determinism unclear.

## Consequences

Positive:

- Keeps the profile contract client-neutral.
- Makes target support explicit and auditable.
- Prevents unsupported target features from disappearing silently.
- Lets Codex, Claude, and Tabnine evolve independently behind adapters.

Negative:

- Specs must carry a capability matrix and source-verification burden.
- Some profile intent will produce warnings or unsupported messages for some
  targets.
- Advanced features need more per-target design before implementation.

## Revisit Triggers

Revisit this ADR if:

- Tabnine documents hooks, subagents, plugins, or equivalent extension surfaces.
- Codex or Claude materially change their capability model.
- the schema needs global/user-level output support.
- a future implementation wants automatic third-party MCP installation.
- target adapters start sharing enough behavior to justify a common capability
  compiler layer.
