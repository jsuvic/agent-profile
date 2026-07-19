# I6b: Metadata-only package/registry update check

## Parent spec or request

`docs/specs/phase-31.5/issues/006-upgrade-and-lock-resolution.md` (I6). Split
out 2026-07-19 alongside I6a/I6c/I6d/I6e; carries forward I6's still-open
registry-check acceptance criterion.

## Intent summary

Let the `upgrade` command optionally report whether a newer Agent Profile
package/catalog is available, purely from metadata, without ever installing
or mutating anything.

## Behavior slice

When explicitly consented (a separate, distinct consent from any probe
consent - see I6c), `upgrade` performs one read-only metadata lookup (e.g. the
npm registry's package metadata endpoint, no auth, no package download) for
the running package's name, compares the returned version/catalog metadata
against what's installed, and if newer, reports that fact plus manual update
guidance (e.g. "run `npm install -g @agent-profile/cli@latest`"). It never
downloads, installs, or writes anything as a result of this check.

## Non-goals

- Any upgrade comparison/planning logic (I6a) - this item only adds the
  optional network check as an input note to that flow.
- Probe consent/mechanics (I6c) - distinct consent, distinct mechanism.
- Automatic installation, remote catalog mutation, or forced migration
  (already a non-goal of parent I6).
- Authenticated registry access or private registries.

## Acceptance criteria

- An optional metadata-only registry check reports a newer package/catalog
  and manual update guidance; it never downloads or installs.
- Declining this check (the default) performs zero network access and the
  upgrade flow proceeds identically to today.
- A network failure, timeout, or malformed response degrades to "could not
  check" guidance, never a hard failure of the surrounding `upgrade` command.
- No credentials, tokens, or telemetry are sent as part of the request.

## Expected RED proof

`agent-profile upgrade` has no network-check code path today; there is no way
to ask it whether a newer package is available.

## Expected GREEN proof

Focused tests proving: consented check reports newer/current/older/unknown
correctly against a mocked registry response; declined check makes zero
network calls (proven via a network sentinel, not just code inspection);
failure/timeout/malformed-response cases degrade gracefully; no credential or
telemetry data appears in the outgoing request.

## Seam under test

`explicit consent + installed version -> zero-or-one read-only HTTP request
-> report or degrade`.

## Allowed mock boundary

The package-metadata HTTP call itself (mock the registry response). Do not
mock consent handling or the guidance-rendering logic.

## Test command guidance

Run focused `apps/cli` upgrade tests plus the existing network-sentinel test
harness (see `withNetworkSentinel` usage in `apps/cli/src/upgrade.test.ts`)
to prove zero-network-by-default, then affected workspace suites and check.

## Likely file ownership

- CLI upgrade optional update-check module and presentation
- Upgrade CLI tests using the existing network-sentinel pattern

## Dependencies

I6a (attaches to that command's flow).

## Parallelism notes

Can proceed in parallel with I6d once I6a's command shape is stable;
serialize on I6a's shared CLI entrypoint/presentation edits. I6c depends on
this item landing first (its own acceptance criteria require testing
against this item's real consent, not a placeholder), so this item is a
prerequisite for I6c, not a parallel sibling.

## Contract impact

Adds one new optional, explicitly-consented network call to `upgrade`. No
change to default (declined) behavior.

## Security impact

Read-only, unauthenticated, no telemetry, no credentials, opt-in only,
degrades safely on any failure.

## Documentation impact

Document the optional check, what it does and doesn't do (no auto-install),
and its consent prompt.

## Review expectations

Inspect zero-network-by-default proof (network sentinel, not just code
reading), consent independence from probe consent, and graceful degradation
on every failure mode.
