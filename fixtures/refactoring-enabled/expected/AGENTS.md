# AGENTS.md

## Instruction Precedence

If generated and manual instructions conflict, follow the manual project instructions unless they would weaken safety, privacy, or permission limits. Safety, privacy, and explicit deny rules always win.

## Project

Name: refactoring-enabled

Description: AI-agent setup that enables refactoring guidance.

## Stack

- Languages: typescript
- Frameworks: None declared
- Package managers: npm
- Testing: None declared

## Enabled AI Clients

- Tabnine
- Codex
- Claude

## Development Workflow

- SDD: Required
- TDD: Required
- Final implementation review: Required

## Refactoring

Use these rules when restructuring code without changing observable behavior.

**Principles**

- Refactor to remove duplication, clarify intent, or unlock a planned change.
- Do not refactor for style preference alone or to chase a new pattern.
- Keep refactoring commits separate from behavior changes.

**Safe Refactoring Workflow**

- Identify the code smell or constraint that motivates the change.
- Check existing abstractions before introducing a new one.
- Define expected behavior in tests before restructuring.
- Make the smallest extraction that solves the problem.
- Preserve public behavior; run tests and golden fixtures after each step.
- Summarize what was intentionally not changed in the review notes.

**Restrictions**

- Do not rename public APIs without explicit approval.
- Do not move files across modules without explicit approval.
- Do not change schemas, endpoint contracts, or build tooling without explicit approval.
- Do not refactor and add features in the same change.

See the `## Completion Checklist` section for shared review steps.

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
