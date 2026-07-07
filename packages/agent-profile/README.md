# agent-profile

Preview local-first AI Agent Profile Compiler for Codex, Claude, and Tabnine.

`agent-profile` creates one canonical `ai-profile.yaml` in your repository and
compiles it into deterministic agent-specific configuration files. It is for
developers who want consistent AI coding-agent instructions without copying the
same policy across separate tool configs.

## Preview Status

This package is in preview / early access. `agent-profile@0.4.1` is usable for
experimentation, but the schema, generated files, and command details may change
before `1.0`.

Feedback is welcome at:

- https://github.com/jsuvic/agent-profile/discussions
- https://github.com/jsuvic/agent-profile/issues

## Quick Start

Requirements: Node.js 24+ and npm 11+.

From your project root:

```bash
npx agent-profile init --write
npx agent-profile compile --dry-run
npx agent-profile compile --write
npx agent-profile doctor
npx agent-profile ui
```

## What It Solves

AI coding agents need overlapping project context: conventions, safety rules,
allowed workflows, target-specific settings, and reminders not to expose source
or secrets. Maintaining that context by hand across `AGENTS.md`, `CLAUDE.md`,
Codex config, Tabnine guidance, and MCP settings causes drift.

`agent-profile` makes `ai-profile.yaml` the source of truth and treats
agent-specific files as generated artifacts.

## Commands

### `init`

Creates a starting `ai-profile.yaml` from local repository signals.

```bash
npx agent-profile init --dry-run
npx agent-profile init --write
```

`init` detects supported stack metadata such as languages, frameworks, package
managers, and test tools from a small allowlist of root metadata files
(`package.json`, `tsconfig.json`, `svelte.config.*`, `vite.config.*`,
`playwright.config.*`, `pom.xml`, `build.gradle`, `build.gradle.kts`, and
`pubspec.yaml` for Flutter/Dart). It does not read `.env` files or upload
source code. If no supported language metadata exists yet, `init` refuses to
write because schema v1 requires `stack.languages`; create `ai-profile.yaml`
manually for documentation-only or currently unsupported project stacks.

### `compile`

Turns `ai-profile.yaml` into target-specific files.

```bash
npx agent-profile compile --dry-run
npx agent-profile compile --write
```

Dry-run is the safe preview path. `--write` applies generated files locally.

### `doctor`

Checks profile structure, lockfile drift, generated artifacts, permissions, and
security hygiene.

```bash
npx agent-profile doctor
```

### `ui`

Starts the read-only local UI for the current project.

```bash
npx agent-profile ui
npx agent-profile ui --root /path/to/project --port 5174
```

The UI binds to loopback only and reads project state from the selected root.
Browser writes are not enabled.

## Current Targets

- Tabnine guidelines and MCP config
- Codex project config and workflow skills
- Claude project config, `CLAUDE.md`, and workflow skills

## Local-First Contract

- No source-code upload
- No secret upload
- No hosted execution
- No telemetry by default
- Generated files are deterministic
- Write-capable commands use explicit `--write`
- Runtime permissions are enforced by target agent clients
