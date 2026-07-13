# AGENTS.md

## Instruction Precedence

If generated and manual instructions conflict, follow the manual project instructions unless they would weaken safety, privacy, or permission limits. Safety, privacy, and explicit deny rules always win.

## Project

Name: subagent-policy-enabled

Description: AI-agent setup that enables the role-aware subagent policy.

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

## Subagent Execution Policy

Use this policy when delegating work to subagents. It selects model capability and effort by role, sends isolated task capsules, bounds delegation, prefers a verified local repository index when enabled, and records metadata-only evidence.

**Role Capability And Effort Matrix**

Mapping version: 2 (client evidence dated 2026-07-13). Capability and effort are canonical intent; the resolved, version-pinned Codex and Claude controls come from the versioned client mapping. Verify override availability against the installed client's official documentation.

| Role | Capability | Effort | Codex (model / reasoning) | Claude (model / effort) |
| ---- | ---------- | ------ | ------------------------- | ------------------------- |
| implementer | balanced | medium | gpt-5.2-codex / medium | claude-sonnet-4-20250514 / medium |
| complex-implementer | balanced | high | gpt-5.2-codex / high | claude-sonnet-4-20250514 / high |
| explorer | balanced | low | gpt-5.2-codex / low | claude-sonnet-4-20250514 / low |
| spec-reviewer | balanced | high | gpt-5.2-codex / high | claude-sonnet-4-20250514 / high |
| quality-reviewer | balanced | high | gpt-5.2-codex / high | claude-sonnet-4-20250514 / high |
| critical-reviewer | strongest | high | gpt-5.2-codex / high | claude-opus-4-1-20250805 / high |
| architect | strongest | extra-high | gpt-5.2-codex / xhigh | claude-opus-4-1-20250805 / xhigh |
| grill | strongest | high | gpt-5.2-codex / high | claude-opus-4-1-20250805 / high |
| mechanical | efficient | medium | gpt-5.1-codex-mini / medium | claude-3-5-haiku-20241022 / medium |

**Task Capsule Contract**

- Hand off only a task capsule: objective, authoritative artifact paths, explicit contracts and non-goals, seam and mock boundary, validation commands, write ownership, and known blockers.
- Do not inherit full chat history or unrelated memory.

**Targeted Memory**

- Recall only memory relevant to the task; do not inject broad or unrelated memory by default.

**Orchestration Bounds**

- Maximum delegation depth is 1; a subagent must not delegate further.
- At most 3 concurrent subagent threads.
- No parallel or overlapping repository writes.
- Run implementation, then spec review, then quality review sequentially. Parallelize only independent read-only work.

**Indexed-First Retrieval**

- Prefer verified local indexed repository context (provider: cce) before broad file reads.
- The indexed provider is recommended, never required, and never installed or indexed automatically.

**Degraded Mode**

- If indexed context is missing or unhealthy, name the failed state, continue when the task is otherwise safe, bound native discovery, and record the fallback in evidence.

**Evidence Contract**

- Record metadata only: role, resolved capability and effort, mapping version, task-capsule fields present, indexed state, fallback reason, tool-call and thread counts, validation outcome, and coarse token usage when the client exposes it.
- Never record prompts, source, retrieved chunks, diffs, tool payloads, secrets, or raw paths needing redaction.
- The ephemeral summary is required; the local trace is off by default and remains repository-local, redacted, and retention-bounded when enabled.

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
