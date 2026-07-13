# ADR 0015: Provider-Neutral Indexed Repository Context

## Status

Accepted 2026-07-13 with phase-30/001 spec approval.

## Context

Focused local repository retrieval can substantially reduce repeated broad
reads, but tool installation, index state, MCP registration, approval, and
health differ by client. Binding the canonical profile directly to CCE would
make a replaceable tool name a long-lived product contract; requiring it would
also block otherwise safe work.

## Decision

The canonical contract models an `indexed` repository-context capability.
Adapters translate that capability to clients. CCE is the first, recommended,
and only supported adapter in phase 30. Its absence or failure produces an
explicit bounded degraded mode, never a mandatory installation or execution
block. APC may diagnose local readiness but may not install CCE or create its
repository index.

## Rationale

The abstraction preserves the user-facing intent if tools change, while one
adapter keeps the first implementation testable and honest. Nonblocking
degradation respects local-first adoption and prevents an optional optimizer
from becoming a new availability dependency.

## Consequences

Positive:

- Profiles describe the needed capability instead of one MCP implementation.
- CCE can be recommended concretely without becoming mandatory.
- A future adapter can be added through a new approved capability mapping.

Negative:

- The first release carries abstraction overhead with only one adapter.
- Degraded mode may save fewer tokens and needs explicit evidence.
- Client readiness normalization requires maintained, version-aware probes.
