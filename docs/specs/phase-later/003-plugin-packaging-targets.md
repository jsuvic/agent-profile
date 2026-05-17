# Spec: Plugin Packaging Targets

## Status

Draft for a later phase. Not MVP.

## Problem

Some AI coding clients support plugin packaging or extension distribution, but
package structure, install scope, trust model, and publication rules differ per
target.

## Goal

Define how Agent Profile Compiler may represent plugin packaging intent and
generate project-local plugin package artifacts for targets that officially
support them.

## Non-Goals

- implementing plugin packaging in MVP
- installing plugins
- publishing plugins
- generating global/user-level plugin installs without explicit opt-in

## Inputs

- future `ai-profile.yaml` capability intent
- official target documentation for Codex, Claude, and Tabnine
- target-specific plugin packaging specs

## Outputs

- project-local plugin package artifacts only where supported
- not-supported or not-generated messages for unsupported targets
- doctor findings for unsafe plugin package definitions

## Contracts

- Plugin packaging requires explicit opt-in.
- Project-local output is the default.
- Global/user-level output requires a separate approved spec.
- Doctor must validate plugin artifacts before generation is considered safe.
- Generation must define Codex, Claude, and Tabnine behavior separately.
- Unsupported target behavior must not be silently ignored.

## Security Rules

- Do not install or publish plugins during generation, validation, or doctor
  checks.
- Do not install dependencies automatically.
- Do not embed secrets or production access.
- Do not generate packages that imply runtime permissions broader than profile
  safety intent.

## Per-Target Plugin Surface

Re-verify against current official client docs before implementation.

Claude Code (per current docs at `https://code.claude.com/docs/en/plugins`):

- Plugins ship as `.plugin` bundles containing one or more skills,
  subagents, hooks, slash commands, and project MCP server declarations.
- Plugin namespacing for skills uses `plugin:skill` form.
- Marketplaces are catalogues of plugins; users install by short code.
- Trust model: install scope is per-user; project plugins are loaded when
  the user has installed the matching plugin.

Codex (per current Codex plugin docs at the time of implementation).

Tabnine plugin support remains `unknown` until verified.

## Generated Plugin Bundle Layout

```text
my-plugin.plugin/
  plugin.json                  # plugin manifest (name, version, description)
  skills/<skill-name>/SKILL.md # bundled skills (cross-ref phase-03/004, phase-03/005)
  agents/<name>.md             # bundled subagents (cross-ref phase-later/002)
  hooks/hooks.json             # bundled hooks (cross-ref phase-later/001)
  commands/<name>.md           # bundled slash commands (cross-ref phase-later/013)
  mcp/mcp_servers.json         # bundled MCP servers (cross-ref phase-later/008)
```

The compiler emits the bundle deterministically: stable file traversal
order, byte-stable manifest, lockfile-tracked content hashes per file.

## Profile Shape (Illustrative)

```yaml
# ai-profile.yaml (illustrative)
plugins:
  - name: agent-profile-team-pack
    version: 0.1.0
    description: |
      Team-wide review perspectives, code-quality skill, and standup command.
    bundle:
      skills:
        - review-security
        - review-performance
        - code-quality
      subagents:
        - code-reviewer
      hooks:
        - format-typescript
        - lint-typescript
      commands:
        - standup
      mcpServers: []
    clients: [claude]
    marketplace:
      enabled: false       # opt-in publication; not part of compile
      shortCode: agent-profile-team-pack
```

## Marketplace Metadata

Marketplace publication is **out of compile-time scope**. Compile only
produces the bundle directory. A separate command would publish it to a
marketplace; that command is not in this spec. When
`marketplace.enabled: true`, doctor reports `LINT-PLUGIN-MARKETPLACE-001`
reminding the user that publication is a manual step.

## Doctor Lint Catalogue

- `LINT-PLUGIN-001` — `plugin.json` missing required field
  (name / version / description)
- `LINT-PLUGIN-002` — bundled skill name not produced by the current
  compile (orphan inside the plugin)
- `LINT-PLUGIN-003` — bundled subagent name not produced by the current
  compile
- `LINT-PLUGIN-004` — bundled hook name not produced by the current compile
- `LINT-PLUGIN-005` — bundled command name not produced by the current
  compile
- `LINT-PLUGIN-006` — bundled MCP server requires credentials but no
  `006`-style env reference is declared
- `LINT-PLUGIN-007` — `clients` lists a target whose plugin support is not
  `confirmed-official` in the capability matrix
- `LINT-PLUGIN-008` — `version` is not semver-compatible
- `LINT-PLUGIN-MARKETPLACE-001` — `marketplace.enabled: true` is set;
  publication is manual and out of compile-time scope

## Acceptance Criteria

- target support is documented with confidence labels and verified plugin
  surfaces
- unsupported targets produce clear `disabled_target` results
- generated plugin bundles are project-local unless explicitly opted into
  otherwise
- doctor validates generated plugin artifacts via the `LINT-PLUGIN-*`
  catalogue
- every bundle component (skills / subagents / hooks / commands / MCP) has
  at least one golden fixture exercising the plugin pathway
- bundle output is byte-deterministic across runs and OSes

## Tests

- supported target golden output tests covering each bundle component
- unsupported target message tests
- no install or publish regression tests at compile or doctor time
- doctor lint tests for each `LINT-PLUGIN-*` rule
- semver rejection test for `LINT-PLUGIN-008`
- absence test (no `plugins` block → no bundle, behavior unchanged)
- determinism test for bundle traversal and manifest bytes

## Documentation Updates

- target docs for Codex, Claude, and Tabnine
- capability matrix
- cross-reference `phase-later/001-hooks-targets.md`,
  `phase-later/002-subagents-targets.md`,
  `phase-later/008-mcp-server-declaration-schema.md`,
  `phase-later/013-slash-commands-targets.md`,
  `phase-03/004-codex-workflow-skills-target.md`, and
  `phase-03/005-claude-workflow-skills-target.md`

## Final Review Checklist

- no plugins install or publish during compile or doctor
- no automatic dependency installation
- target behavior is independently specified
- unsupported targets are explicit
- bundle layout matches current official Claude / Codex plugin docs
- bundled MCP servers route credentials through `006`, not inline
- marketplace publication is explicitly out of compile-time scope
