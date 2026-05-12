# AGENTS.md

## Project

This repository implements a local-first AI Agent Profile Compiler.

The tool defines one canonical `ai-profile.yaml` and compiles it into
agent-specific configuration for Tabnine, Codex, and Claude.

## Product Principles

- Local-first by default.
- No source-code upload.
- No secret upload.
- No hosted execution in the MVP.
- Generated files must be deterministic.
- Safety checks are part of the product, not an afterthought.
- Prefer explicit contracts over implicit behavior.

## Development Workflow

Use SDD/TDD.

Before implementation:

1. Read the relevant spec in `docs/specs/`.
2. Confirm the goal, non-goals, contracts, and acceptance criteria.
3. Do not expand scope beyond the spec.

During implementation:

1. Add or update tests first where practical.
2. Keep changes small and focused.
3. Preserve public contracts.
4. Do not change generated output fixtures unless the spec explicitly requires it.

After implementation:

1. Run tests.
2. Run golden tests.
3. Run doctor/check if available.
4. Review the implementation against the spec.
5. List any incomplete or risky items.

## Safety Rules

Never:

- read or print secrets
- write literal tokens into generated configs
- upload repository content
- add telemetry by default
- execute shell commands without explicit user intent
- install dependencies without explicit user intent

## Copyright Headers

TypeScript source files must start with:

```ts
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors
```

Do not add this header to JSON, Markdown, YAML fixtures, or tsconfig files unless
a later spec requires it.

## Package Manager

Use npm.

## First Supported Targets

- Tabnine
- Codex
- Claude

Do not add Cursor, Aider, Copilot, or enterprise features unless a spec
explicitly adds them.

## Required Final Response For Implementation Tasks

End every implementation task with:

1. What changed
2. Tests run
3. Contract impact
4. Security impact
5. Remaining risks or TODOs
6. Whether the spec acceptance criteria are fully met
