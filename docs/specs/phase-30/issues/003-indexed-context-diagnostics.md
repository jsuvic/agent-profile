# I3: Read-only indexed-context diagnostics

## Parent spec or request

`docs/specs/phase-30/001-role-aware-indexed-subagents.md` and ADR 0015.

## Intent summary

Normalize CCE readiness into one actionable provider-neutral state without
changing files, starting servers, indexing, prompting approval, or using the
network.

## Behavior slice

`agent-profile doctor --indexed-context` evaluates explicit local probe results,
selects exactly one state from the seven-state contract by documented
precedence, and prints redacted next steps for Codex and Claude.

## Non-goals

- Installing or launching CCE.
- Creating or refreshing an index.
- Repairing registration or granting Claude approval.

## Acceptance criteria

Phase-30 acceptance criterion 6.

## Expected RED proof

Focused doctor tests have no indexed-context rows or normalized state detector.

## Expected GREEN proof

A table covers all states and collision precedence, and mutation/network
sentinels remain untouched.

## Seam under test

`IndexedContextObservations -> normalized state + doctor result`.

## Allowed mock boundary

Executable lookup, filesystem metadata, client registration/status adapters,
and local health probe are unmanaged boundaries. Inject observations; do not
mock the state reducer.

## Test command guidance

Run focused doctor/state tests, CLI output tests, then full tests and check.

## Likely file ownership

- CLI doctor option/result rendering
- Pure indexed-state reducer and target observation adapters
- Error/event codes, docs, and fixtures

## Dependencies

I1 provider/config IR and enabled-policy rules.

## Parallelism notes

Mutually parallel-safe with I2 after I1 apart from shared types/docs.

## Contract impact

Adds an explicit doctor option and the closed normalized state set. Existing
doctor output without the option must remain byte-identical unless separately
approved.

## Security impact

No secret-store reads, file writes, process launch, index operation, approval
action, telemetry, or network. Redact paths according to existing policy.

## Documentation impact

Doctor reference, state table, precedence, target-specific next steps, and CCE
manual installation/indexing guidance.

## Implementation context

Include direct project MCP registration and Codex-session exposure as distinct
observations even if both normalize to `registration-missing` or `unhealthy`.
Claude discovered-but-untrusted normalizes to `approval-required`.

## Review expectations

Require collision rows (for example missing provider plus missing registration),
stale index, failed server, unreadable config, and exact no-mutation sentinels.
