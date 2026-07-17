# AGENTS.md

## Instruction Precedence

If generated and manual instructions conflict, follow the manual project instructions unless they would weaken safety, privacy, or permission limits. Safety, privacy, and explicit deny rules always win.

## Project

Name: subagent-policy-v3-role-aware-enabled

Description: AI-agent setup that opts into the mapping-v3 role-aware model-policy preset.

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

Mapping version: 3 (v3 preset: role-aware; client evidence dated 2026-07-16). Capability and effort are canonical intent; the resolved, exact Codex and Claude identifiers come from the versioned v3 target catalog. Each cell's status states whether Agent Profile actually configures that exact surface (`configured`), offers guidance only (`advisory`), has no candidate (`unsupported`), or is client-verification-required (`unverified`); listed alternatives are ordered candidates, never a runtime fallback. Only the `implementer` role's Codex resolution is written into `.codex/config.toml`; every other cell is guidance only.

| Role | Capability | Effort | Codex (model / reasoning) | Claude (model / effort) |
| ---- | ---------- | ------ | ------------------------- | ------------------------- |
| grill | strongest | extra-high | gpt-5.6-sol / xhigh (advisory) | claude-fable-5 / xhigh (unverified; alternatives: claude-opus-4-8) |
| architect | strongest | extra-high | gpt-5.6-sol / xhigh (advisory) | claude-fable-5 / xhigh (unverified; alternatives: claude-opus-4-8) |
| critical-reviewer | strongest | extra-high | gpt-5.6-sol / xhigh (advisory) | claude-fable-5 / xhigh (unverified; alternatives: claude-opus-4-8) |
| spec-reviewer | strongest | high | gpt-5.6-sol / high (advisory) | claude-fable-5 / high (unverified; alternatives: claude-opus-4-8) |
| quality-reviewer | strongest | high | gpt-5.6-sol / high (advisory) | claude-fable-5 / high (unverified; alternatives: claude-opus-4-8) |
| complex-implementer | balanced | high | gpt-5.6-terra / high (advisory) | claude-sonnet-5 / high (unverified) |
| implementer | strongest | extra-high | organization-codex-model / xhigh (unverified) | claude-opus-4-8 / xhigh (advisory) |
| routine-implementer | balanced | medium | gpt-5.6-terra / medium (advisory) | claude-sonnet-5 / medium (unverified) |
| explorer | efficient | low | gpt-5.6-luna / low (advisory) | claude-haiku-4-5 / low (advisory) |
| mechanical | efficient | medium | gpt-5.6-luna / medium (advisory) | claude-haiku-4-5 / medium (advisory) |

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
