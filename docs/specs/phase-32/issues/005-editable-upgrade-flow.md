# I5: Editable interactive upgrade review and atomic apply

## Parent spec or request

`docs/specs/phase-32/001-guided-repository-update.md`

## Intent summary

Turn adopt-all/customize from opaque choices into an informed, editable,
separately confirmed profile update while keeping automation explicit.

## Behavior slice

Interactive Adopt all and Customize enter one review driven by I3 metadata. The
user edits selections, sees the exact I4 insertion preview, cancels or declines
without writes, or confirms one atomic profile write. An existing lockfile
participates atomically; without a lockfile, upgrade preserves the Phase 27
insertion-only/deferred-stamp exception. Compile is offered only afterward
through a separate default-No confirmation.

## Non-goals

- Changing scripted `--write --adopt-recommended`, JSON/quiet, or non-TTY text.
- Selecting permission postures.
- Auto-running compile or bypassing insertion refusals.

## Acceptance criteria

- Phase-32 acceptance criteria 5-6 and 9.
- Adopt all preselects every offered item but cannot skip editable review.
- Customize uses the same review path and supports per-item change.
- Review displays every I3 field and every I4 refusal before final confirmation.
- Cancel/decline preserve profile and lock bytes; confirm updates an existing
  lockfile atomically with the profile, while an absent lockfile remains absent
  and receives no catalog-version stamp.
- Compile requires a fresh confirmation and decline leaves the successful
  profile update intact.

## Expected RED proof

The current interactive route can choose Adopt all, emit refusals or a preview,
and exit without an editable impact review or a clear profile-write consent
boundary.

## Expected GREEN proof

Prompt/state tests pass for preselection, editing, Customize parity, cancel,
decline, existing-lock atomic confirm, no-lockfile deferred stamp, refusal, and
separate compile consent; frozen scripted tests remain byte-identical.

## Seam under test

Injected interactive prompts/streams driving the real upgrade orchestration
against temporary repository fixtures.

## Allowed mock boundary

Injected prompts and temporary filesystem only. Review builder, insertion
planner, atomic writer, compile planner, and dispatcher routing remain real.

## Test command guidance

Run focused upgrade-clack/orchestration tests, dispatcher follow-up tests,
frozen non-interactive/JSON/quiet regressions, full CLI tests, check, lint,
verify:pack, and package dry-run.

## Likely file ownership

- Upgrade prompt/presentation adapter
- Upgrade orchestration and atomic write plan
- Dispatcher follow-up integration
- Interactive/frozen CLI fixtures

## Dependencies

`sequenced` after Phase 32 I3 and I4.

## Parallelism notes

Can proceed in parallel with I2 after its dependencies. Own upgrade/dispatcher
presentation seams; coordinate shared CLI entrypoint edits.

## Contract impact

Interactive behavior changes intentionally. Scripted flags, non-interactive
text, JSON/quiet, exit codes, and compile consent remain frozen.

## Security impact

No mutation before exact preview and fresh confirmation; existing-lock atomic
write only; decline/cancel byte identity; no network, client launch, or secret
access.

## Documentation impact

CLI upgrade journey, adopt-all semantics, automation boundary, changelog.

## Implementation context

Treat preselection, review editing, profile apply, and compile follow-up as
distinct states. Reuse existing consumed-state filtering and atomic planners.

## Review expectations

Audit every transition and exit code, prove no hidden write path, preserve all
frozen surfaces, and require runtime byte sentinels for cancel/decline/failure.
