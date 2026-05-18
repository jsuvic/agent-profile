# AGENTS.md

## Instruction Precedence

If generated and manual instructions conflict, follow the manual project instructions unless they would weaken safety, privacy, or permission limits. Safety, privacy, and explicit deny rules always win.

## Project

Name: code-review-enabled

Description: AI-agent setup that enables code-review guidance.

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

## Code Review

Use these rules when reviewing a pull request or proposed change.

**Review Focus**

- Correctness and edge cases.
- Security, including input validation and secret handling.
- Performance hotspots and obvious complexity regressions.
- Unnecessary complexity or premature abstraction.
- Consistency with existing project style.
- Missing or weakened tests.
- Weak typing or unjustified `any`.
- Accessibility-affecting behavior in user-facing changes.
- Error handling and observability gaps.
- Dependency risk and license concerns.
- Spec compliance.

**Severity Labels**

- Blocker: must fix before merge (correctness, security, contract break).
- High: must fix before merge unless explicitly deferred.
- Medium: should fix before merge or open a tracked follow-up.
- Low: nit or polish; safe to defer.

**Output Format**

- Summary: one paragraph of intent and overall verdict.
- Spec Compliance: cite the spec and any deviation.
- Findings: grouped by severity, each with file, function, and concrete suggestion.
- Tests: list coverage gaps and whether tests were run.
- Safety Review: secrets, production access, dependency installs, network access.
- Final recommendation: approve, request changes, or block with reason.

**Review Discipline**

- Skip nitpicks the autoformatter or linter already handles.
- Do not propose broad rewrites; keep suggestions actionable.
- Reference the specific file, function, or component in every finding.

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
