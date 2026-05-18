<!-- agent-profile:generated:start -->
# AGENTS.md

## Instruction Precedence

If generated and manual instructions conflict, follow the manual project instructions unless they would weaken safety, privacy, or permission limits. Safety, privacy, and explicit deny rules always win.

## Project

Name: agent-profile

Description: Local AI-agent setup.

## Stack

- Languages: typescript
- Frameworks: None declared
- Package managers: npm
- Testing: None declared

## Enabled AI Clients

- Codex
- Claude

## Development Workflow

- SDD: Required
- TDD: Required
- Final implementation review: Required

## Permissions

| Permission         | Mode  |
| ------------------ | ----- |
| filesystem read    | allow |
| filesystem write   | ask   |
| shell run          | ask   |
| dependency install | ask   |
| external network   | ask   |
| secrets access     | deny  |
| production access  | deny  |

## Safety Rules

- No source-code upload.
- No secret upload.
- No literal tokens in generated configs.
- No telemetry by default.
- No hosted execution in the MVP.

## Scope Limits

Cursor, Aider, Copilot, hosted gateways, enterprise RBAC, SIEM integrations, and custom sandbox runtimes are out of scope unless an approved spec adds them.

## Completion Checklist

- Run tests.
- Run golden tests when generated files change.
- Run doctor/check once available.
- Review the implementation against the relevant spec.
- List remaining risks or TODOs.
<!-- agent-profile:generated:end -->

<!-- agent-profile:manual:start -->
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

For final spec reviews:

1. Build a spec-to-test matrix for every MUST, acceptance criterion, and error contract.
2. For each item, cite either a focused test or explicit static-only evidence.
3. Treat static-only evidence as weaker than a regression test and call that out.
4. For local-first, no-upload, no-secret, and no-source-read claims, prefer runtime sentinels over import inspection alone.
5. For documented error tables, require table-driven CLI or API tests covering code, exit/status, and redaction behavior.
6. For parsers and token formats, review canonical decoding, malformed encodings, size limits, and validation order.
7. Document or revert any intentional UX divergence from existing behavior.

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
<!-- agent-profile:manual:end -->
