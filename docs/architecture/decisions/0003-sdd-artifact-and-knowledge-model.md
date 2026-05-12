# ADR 0003: SDD Artifact and Knowledge Model

## Status

Accepted

## Context

Agent Profile Compiler should help AI coding tools understand durable project
context, decisions, assumptions, requirements, and active specs. This future
knowledge layer must preserve the project's local-first trust model.

The knowledge layer must not mean cloud memory, hosted embeddings, uploading a
repository to a vector database, or adding a dedicated MCP server in the MVP.

## Decision

The knowledge layer starts as repo-local files.

A future optional `.sdlc` structure may be generated:

```text
.sdlc/
  context/
  specs/
  knowledge/
    decisions/
    assumptions/
    questions/
  templates/
```

The MVP will not implement a dedicated knowledge MCP, tool, or agent. A later
phase may expose this repo-local knowledge through local tools or MCP.

The knowledge layer must not upload source code or secrets. Doctor/linter may
later validate required SDD artifacts.

## Suggested Future Layout

```text
.sdlc/
  context/
    project-overview.md
    architecture.md
    conventions.md
    testing.md
    security.md

  specs/
    REQ-001-feature-name/
      requirement.md
      tasks/
        TASK-001.md

  knowledge/
    decisions/
      DEC-001-use-npm.md
    assumptions/
      ASM-001-no-cloud-upload.md
    questions/
      Q-001-mcp-client-mode.md

  templates/
    requirement-template.md
    task-template.md
    decision-template.md
    assumption-template.md
```

## Alternatives Considered

- Cloud memory: rejected for MVP because it conflicts with local-first trust.
- Hosted vector database: rejected because it implies source/context upload and
  additional security review.
- Dedicated MCP server in MVP: rejected because the first value can come from
  files and doctor checks.
- No knowledge model: rejected because SDD artifacts need durable, discoverable
  locations.

## Consequences

- Phase 1 schema work should avoid hard-coding `.sdlc` as required.
- Future init/scaffold specs may generate optional `.sdlc` folders and
  templates.
- Future doctor checks may validate SDD artifacts without requiring MCP.
- Any local MCP/tool layer must read repo-local artifacts and preserve the
  no-upload/no-secret contract.

## Revisit Triggers

Revisit this decision if:

- users need project context retrieval across many local repos
- `.sdlc` scaffolding becomes a core onboarding feature
- local MCP support becomes necessary for Codex, Claude, or Tabnine workflows
- teams need policy-controlled SDD artifact validation
