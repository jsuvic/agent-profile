# AGENTS.md

## Instruction Precedence

If generated and manual instructions conflict, follow the manual project instructions unless they would weaken safety, privacy, or permission limits. Safety, privacy, and explicit deny rules always win.

## Project

Name: subagents-enabled

Description: Fixture exercising Phase 11 subagent generation for Claude, Codex, and Tabnine.

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
