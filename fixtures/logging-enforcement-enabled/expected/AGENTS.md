# AGENTS.md

## Instruction Precedence

If generated and manual instructions conflict, follow the manual project instructions unless they would weaken safety, privacy, or permission limits. Safety, privacy, and explicit deny rules always win.

## Project

Name: logging-enforcement-enabled

Description: AI-agent setup that enables logging guidance with enforcement.

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

## Logging Guidance

Use these rules to decide what to log, how to name it, and how to keep diagnostics safe and separate from product output.

**Debug vs Observability**

- Separate throwaway debug output from durable observability: debug prints exist only to diagnose a failure in progress.
- Remove debug output before marking work done; leftover debug prints are a defect, not a feature.
- Prefer a narrower failing test over debug prints to isolate a problem.

**Project Convention Precedence**

- Follow the project's existing logging convention when one exists; do not invent an ad hoc format alongside it.
- When no convention exists, propose one as an ADR candidate before adopting it; never invent a convention ad hoc.

**Stable Event Codes**

- Attach a stable event code to each new error path instead of free text.
- Keep codes stable so support and tooling can rely on them; free-text messages are not a substitute.

**Redaction Rule**

- Never log secrets, tokens, credentials, environment variable values, user file contents, or personal or production data. Log by allowlist: only values explicitly known to be safe.

**Channel Separation**

- Keep diagnostics on the diagnostic channel so they never contaminate machine or product output (stderr vs stdout, or the platform equivalent).

**Logs and Tests**

- Treat support-relied logs as observable behavior that deserves tests.
- Never assert on incidental debug logs.

**Priority Order**

- When these rules conflict, apply them in this order: redaction > convention > codes (redaction beats project convention beats event codes).

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
