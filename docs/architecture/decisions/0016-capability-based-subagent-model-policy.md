# ADR 0016: Capability-Based Subagent Model Policy

## Status

Accepted 2026-07-13 with phase-30/001 spec approval.

## Context

Exact Codex and Claude model names and effort controls change over time. A
canonical profile that embeds today's names either becomes stale or changes
behavior silently when aliases move. A single strongest-model default wastes
budget on mechanical work, while a cheapest-model default weakens architecture
and critical review.

## Decision

Canonical subagent roles select a capability class (`efficient`, `balanced`,
or `strongest`) and effort intent (`low`, `medium`, `high`, or `extra-high`).
Versioned, target-specific mappings resolve those intents to verified client
controls. Exact overrides are allowed only through validated target override
fields. Mapping changes are explicit release changes with tests and dated
official evidence.

## Rationale

Stable intent separates workflow design from vendor naming while retaining
deterministic output and user control. Role defaults allocate expensive
reasoning to decisions and reviews where it matters, not every delegated task.

## Consequences

Positive:

- Model churn does not force canonical role redesign.
- Costs can fall without weakening critical review defaults.
- Resolved choices are deterministic, reviewable, and overrideable.

Negative:

- Mapping evidence must be refreshed and released deliberately.
- Different clients may not express every effort intent exactly.
- Users must inspect resolved evidence rather than infer a model from a class.
