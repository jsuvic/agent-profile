# AGENTS.md

## Project

Name: documentation-enabled

Description: AI-agent setup that enables documentation guidance.

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

## Documentation

Use these rules when adding or updating project documentation.

**When to Update Documentation**

- Setup or onboarding steps changed.
- Workflow, command, or build step changed.
- Public API surface changed.
- Configuration or environment variables changed.
- Testing command changed.
- Deployment or release procedure changed.
- Troubleshooting guidance is newly known.

**Style**

- Write for maintainers, not marketing.
- Provide copy-pasteable commands where applicable.
- Keep examples current; remove examples that no longer run.
- Reference file paths when they help a reader navigate.

**README Rules**

- Keep the existing structure intact.
- Add only relevant new sections.
- Do not rewrite the README without an explicit request.

**Code Comment Policy**

- Comment non-obvious business rules and invariants.
- Comment tricky edge cases the code alone does not reveal.
- Comment surprising technical constraints and security-sensitive behavior.
- Do not write comments that restate the code.

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
