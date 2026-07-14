# I7: Dispatcher permission routing and legacy migration entry

## Parent spec or request

`docs/specs/phase-31/001-permission-posture-lifecycle.md`

## Intent summary

Make permission control discoverable from the existing two-word interactive
entrypoint while preserving the dispatcher as a router and every frozen
non-interactive surface.

## Behavior slice

Interactive bare dispatch always lists Change agent control; preselects it for
hard permission mismatch, incomplete activation, or legacy migration according
to the agreed priority; routes to the same configure flow; and participates in
the existing consent-gated follow-up chain.

## Non-goals

- Reimplementing configure or doctor detection.
- Adding bare-command flags.
- Any detection or presentation load on non-TTY/piped/CI paths.

## Acceptance criteria

- Phase-31 acceptance criteria 4 and 12-13.
- Existing unrelated dispatcher priority rows remain unchanged.
- Existing Autonomous setup is detected through canonical plan status and
  routes to the explicit migration choices.
- Cancel/decline/exit-code passthrough follow ADR 0014.

## Expected RED proof

Dispatcher state fixtures do not list or preselect agent-control actions and
cannot route legacy migration; frozen non-TTY tests stay green throughout.

## Expected GREEN proof

New state/priority/follow-up matrix passes; all existing dispatcher fixtures
remain green; non-TTY byte and no-detection sentinels are unchanged.

## Seam under test

`evaluateDispatchState(repo) -> ordered actions` plus injected-menu routing to
the real configure flow.

## Allowed mock boundary

Temporary repo fixtures and injected prompts/streams only. Detection and routed
commands are real owned modules.

## Test command guidance

Run focused dispatcher state/priority tests, non-TTY golden/sentinel, full CLI
tests, check, lint, verify:pack, and package dry-run.

## Likely file ownership

- `apps/cli/src/dispatch.ts`
- `apps/cli/src/dispatch-clack.ts`
- Thin CLI routing integration and dispatcher fixtures
- README quick-start and changelog

## Dependencies

`sequenced` after I4 and I6.

## Parallelism notes

Owns dispatcher seams; avoid concurrent `index.ts`/dispatch changes with I4.

## Contract impact

Adds one interactive action/state family. Non-TTY help, no-detection behavior,
subcommands, parsing, and exit codes remain byte/behavior identical.

## Security impact

Dispatcher detection is read-only; menu writes nothing; routed configure keeps
its own preview/consent boundaries.

## Documentation impact

Bare-command journey, action priority, legacy Autonomous migration guidance.

## Implementation context

Import canonical posture/doctor/configure state. Do not copy their logic into
the dispatcher. Preserve consumed-state follow-up filtering.

## Review expectations

Audit every priority collision, always-visible behavior, consumed-state chain,
cancel/decline exit, and strict non-TTY no-detection sentinel.
