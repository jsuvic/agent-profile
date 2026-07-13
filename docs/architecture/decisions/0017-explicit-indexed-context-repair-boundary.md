# ADR 0017: Read-Only Diagnosis And Explicit Indexed-Context Repair

## Status

Accepted 2026-07-13 with phase-30/001 spec approval.

## Context

MCP readiness failures are often easy to identify but their repairs can mutate
project or global client configuration, launch installers, build repository
indexes, or request trust approval. Combining diagnosis and repair makes a
harmless health check unexpectedly stateful and risks overwriting user-owned
configuration.

## Decision

Indexed-context doctor diagnostics are strictly read-only. Setup without
`--write` is a deterministic preview. Explicit `--write` may perform only a
safe, preflighted client registration edit. It may not install CCE, create or
refresh an index, approve Claude MCP, silently mutate global configuration, or
overwrite conflicts. Preconditions and refusals use stable redacted codes.

## Rationale

Separating observation from mutation makes doctor safe for routine use and
keeps installation, indexing, trust, and global scope under human control. A
narrow registration repair still removes repetitive configuration work where
ownership and edit safety can be proved.

## Consequences

Positive:

- Doctor remains safe, repeatable, and automation-friendly.
- Every configuration mutation is previewable and explicit.
- Conflicts and unsafe edits fail closed with actionable codes.

Negative:

- Users still perform installation, indexing, and Claude approval manually.
- Client config formats and registration commands require maintained adapters.
- Some environments will remain in degraded mode until external steps finish.
