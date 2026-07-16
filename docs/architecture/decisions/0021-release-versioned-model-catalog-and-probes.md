# ADR 0021: Release-Versioned Model Catalog and Consented Probes

## Status

Accepted 2026-07-16 with phase-31.5/001 spec approval.

## Context

Model catalogs and account entitlements change faster than Agent Profile
releases. Codex, Claude, and Tabnine do not provide one stable, equivalent,
machine-readable availability interface. Tabnine availability can additionally
be controlled by enterprise administrators or private deployments.

A live remote catalog would be current but would make deterministic planning
depend on mutable external state. A silent availability test would contact a
provider, consume quota, and use the developer's existing authentication
without sufficiently clear intent.

## Decision

Agent Profile ships a reviewed model catalog as versioned package data. Normal
parse, compile, doctor, local UI, and non-interactive init remain offline. An
interactive init, upgrade, or explicit doctor model check may offer a live
probe only after explaining the enabled clients, maximum calls, provider
contact, and possible quota use, and receiving explicit consent.

Each probe runs from a fresh source-free temporary directory with a fixed
content-free prompt and the narrowest documented non-persistent client mode.
It must not read repository files, prompt history, credentials, account
identity, subscription details, remaining quota, or private endpoints. The
client may use its normal authentication internally; Agent Profile neither
reads nor brokers it.

Probe results use the closed set `available | not-entitled |
temporarily-limited | unsupported-client | provider-unavailable |
auth-required | unknown`. Ambiguous errors resolve to `unknown`. Results,
including installed client version and entitlement observations, are
ephemeral. Only user-approved portable intent or an exact override is written
to `ai-profile.yaml`; only deterministic catalog and resolution provenance is
written to `ai-profile.lock`.

Agent Profile automates model enumeration only through a documented,
machine-readable client interface. It never scrapes an interactive model
picker. When Tabnine cannot enumerate models safely, Agent Profile provides
guided manual selection and can validate one exact identifier only when a
documented source-free invocation exists.

Catalog updates require an Agent Profile release. A consented package metadata
check may report that a newer release/catalog exists, but it never downloads,
installs, or mutates configuration.

## Rationale

This preserves deterministic offline behavior while giving users a practical,
explicit way to learn whether the exact choices shown during onboarding work
for their current account or organization.

## Consequences

Positive:

- Offline generation is reproducible and reviewable.
- Provider contact and quota use are visible user decisions.
- Unknown future and private models remain usable without false ranking.
- Tests can replace clients at the process boundary and never contact a
  provider.

Negative:

- The bundled catalog can lag a newly released model.
- Some Tabnine environments require manual selection.
- Availability can change after a successful probe and cannot be guaranteed.
- Each supported client requires maintained invocation and error-classification
  evidence.
