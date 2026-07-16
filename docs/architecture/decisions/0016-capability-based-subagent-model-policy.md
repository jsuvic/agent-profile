# ADR 0016: Capability-Based Agent Model Policy

## Status

Accepted 2026-07-13 with phase-30/001 spec approval.

Amended 2026-07-16 with phase-31.5/001 approval. The stable capability and
effort vocabulary now governs primary workflow stages as well as delegated
roles. The schema-v1 key remains `subagentPolicy` for compatibility; renaming
that key is deferred to a separately approved schema-version decision.

## Context

Exact Codex, Claude, and Tabnine model names and effort controls change over
time. Availability also depends on account entitlement, organization policy,
deployment, and client version. A canonical profile that embeds only today's
names becomes stale, while resolving moving aliases during every compile can
change behavior silently. A single strongest-model default wastes budget on
mechanical work, while a cheapest-model default weakens architecture and
critical review.

## Decision

Primary workflow stages and delegated roles select a capability class
(`efficient`, `balanced`, or `strongest`) and effort intent (`low`, `medium`,
`high`, or `extra-high`). A role-aware mixed preset is the default; quality-first
and cost-conscious presets are explicit alternatives.

A release-versioned catalog and target adapters resolve intent to exact model
identifiers, effort controls, ordered alternatives, and one capability status:
`configured`, `advisory`, `unsupported`, or `unverified`. The canonical profile
stores portable intent and explicit exact overrides. The lockfile records the
approved exact client resolutions and catalog version. Account-scoped probe
results are ephemeral and never become shared repository state.

Known exact identifiers remain compatibility records after they stop being
recommended. Retired records are hidden from ordinary onboarding but are not
deleted from catalog history. Uncatalogued organization/private identifiers
are accepted as explicit, syntactically safe overrides and remain unrated and
unverified unless current target evidence proves more.

Mapping changes ship only with Agent Profile releases, tests, and dated
official evidence. A newer catalog may be reported through an explicit update
check, but remote data never mutates the bundled catalog or silently changes an
existing resolution.

## Rationale

Stable intent separates workflow design from vendor naming while retaining
deterministic output and user control. Role defaults allocate expensive
reasoning to decisions and reviews where it matters, not every task. Locking
the exact approved resolution prevents provider availability and catalog churn
from changing generated behavior during an ordinary compile.

## Consequences

Positive:

- Model churn does not force canonical role redesign.
- Costs can fall without weakening critical review defaults.
- Resolved choices are deterministic, reviewable, and overrideable.
- Enterprise-pinned, legacy, and private Tabnine models remain representable.
- Target adapters state whether a choice is configured or merely advisory.

Negative:

- Mapping evidence must be refreshed and released deliberately.
- Different clients may not express every effort intent exactly.
- Users must inspect resolved evidence rather than infer a model from a class.
- The lockfile gains durable model-resolution provenance.
- The legacy `subagentPolicy` name remains temporarily broader than its name.
- Live availability is never guaranteed by the catalog and must be checked
  explicitly when the user wants account-specific evidence.
