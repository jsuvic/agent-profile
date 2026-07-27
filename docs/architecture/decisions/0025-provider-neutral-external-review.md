# ADR 0025: Provider-Neutral External Review Signal

## Status

Accepted 2026-07-24 with phase-33/001.

## Context

GitHub Codex review supplied valuable independent findings in the triggering
sample, but its private prompt, model, retry policy, availability, and finding
enumeration are not product-controlled. Requiring it would conflict with the
local-first workflow and make completion depend on network and account state.

## Decision

Treat GitHub Codex and any future external reviewer as optional independent
signals. A validated external P1/P2 reopens the local remediation loop when
budget remains and otherwise escalates to human review. The local workflow
must operate without GitHub, network access, or a provider-specific prompt.

## Rationale

Independent external review is useful comparative evidence, but the product
must own its local review contract and failure behavior. Provider-neutral
input preserves that evidence without creating an availability dependency.

## Consequences

Positive:

- External findings can improve local rules and regression cases.
- Offline and non-GitHub workflows remain supported.
- Provider changes do not redefine the local completion contract.

Negative:

- Local and external reviewers may disagree or discover findings at different
  times.
- External findings require validation before they affect workflow state.
- The local reviewer cannot claim parity with private provider behavior.
