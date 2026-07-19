# I6c: Upgrade-flow probe consent, separate from update-check consent

## Parent spec or request

`docs/specs/phase-31.5/issues/006-upgrade-and-lock-resolution.md` (I6). Split
out 2026-07-19 alongside I6a/I6b/I6d/I6e; carries forward I6's still-open
probe-consent acceptance criterion.

## Intent summary

Let `upgrade` optionally re-run I4's consented, source-free model probe to
inform a role/client's adopt decision, with its own separate consent that is
never implied by (or bundled with) I6b's update-check consent.

## Behavior slice

During the Custom-exact or role-aware Adopt paths (I6a), `upgrade` may offer
to run I4's existing consented, source-free probe against a candidate model
to help confirm availability before adopting it. This offer's consent prompt
is distinct from I6b's registry-check consent: accepting or declining one
must never affect the other, and both must default to declined. The probe's
result may only inform the interactive plan being built in this run; it is
never written to the lockfile or any other persisted state (matches I4's
existing non-persistence rule for probe results).

## Non-goals

- The probe mechanism itself (already shipped in I4 - reuse it, don't
  reimplement).
- The metadata-only registry check (I6b) - distinct feature, distinct
  consent.
- Upgrade comparison/planning logic beyond the point where a probe may be
  offered (I6a).

## Acceptance criteria

- Probe consent is separate from update-check consent and writes no
  availability result.
- Declining the probe consent (the default) runs zero probe processes and the
  adopt/custom-exact path proceeds using catalog-only information.
- Accepting the registry-check consent (I6b) never triggers a probe, and
  accepting probe consent never triggers a registry check.
- A probe result, whether run or declined, never appears in the written
  lockfile, profile, or any other persisted file.

## Expected RED proof

`upgrade` has no code path today that offers I4's probe mechanism at all; the
adopt/custom-exact paths (once I6a lands) would otherwise have no way to
incorporate a fresher availability signal without conflating it with the
registry-check consent.

## Expected GREEN proof

Focused tests proving: probe and update-check consents are independently
prompted and independently honored (all four combinations of accept/decline);
a declined probe runs zero processes (proven via the existing process
sentinel pattern from I4's tests); an accepted probe's result influences only
the in-memory plan and never appears in any written file.

## Seam under test

`two independent consent prompts -> zero-or-one probe invocation -> in-memory
plan only, no persisted state`.

## Allowed mock boundary

The probe port/process itself, per I4's existing test pattern. Do not mock
consent handling.

## Test command guidance

Run focused `apps/cli` upgrade tests, reusing I4's existing probe-consent
test patterns and process sentinel, then affected workspace suites and check.

## Likely file ownership

- CLI upgrade planner's optional probe-offer step and presentation
- Upgrade CLI tests asserting consent independence and non-persistence

## Dependencies

I4 (existing probe mechanism), I6a, I6b (to prove independence between the
two consents).

## Parallelism notes

Can proceed in parallel with I6b and I6d once I6a's command shape is stable;
serialize on I6a's shared CLI entrypoint/presentation edits, and on I6b only
for the shared "two independent consents" regression tests.

## Contract impact

Adds one new optional, explicitly-consented probe offer to `upgrade`. No
change to I4's existing probe mechanism or its non-persistence guarantee.

## Security impact

Reuses I4's existing sandboxed/consented probe; no new attack surface. No
probe result is ever persisted.

## Documentation impact

Document the probe offer during upgrade, its independence from the update
check, and the non-persistence guarantee.

## Review expectations

Inspect consent-independence proof (all four combinations), zero-process
proof on decline, and non-persistence proof (grep the written lock/profile
for any probe-shaped field).
