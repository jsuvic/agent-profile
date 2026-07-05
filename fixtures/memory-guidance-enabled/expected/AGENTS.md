# AGENTS.md

## Instruction Precedence

If generated and manual instructions conflict, follow the manual project instructions unless they would weaken safety, privacy, or permission limits. Safety, privacy, and explicit deny rules always win.

## Project

Name: memory-guidance-enabled

Description: AI-agent setup that enables memory guidance.

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

## Memory Guidance

Use these rules to decide what belongs in agent memory and where each enabled client persists it.

**Where Memory Lives**

- Claude Code keeps durable project instructions in `CLAUDE.md` and its auto-memory surface.
- Codex keeps durable project instructions in `AGENTS.md` and its Memories surface.
- Tabnine uses project guidelines for durable instructions; no project-local memory contract is verified, so treat Tabnine memory as unverified rather than assumed.
- Precedence between these surfaces is target-specific; do not assume one client's ordering applies to another.

**Never Store In Memory**

- Never store secrets, tokens, credentials, private keys, production access, personal/customer data, or one-time debugging context in memory.

**Keep Memory Durable**

- Store durable decisions and conventions, not session-specific or volatile state.
- Delete a wrong memory instead of adding a second memory to correct around it.

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
