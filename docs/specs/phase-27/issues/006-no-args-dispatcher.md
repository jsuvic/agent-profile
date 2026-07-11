# I6: No-args interactive dispatcher

## Parent spec or request

`docs/specs/phase-27/004-no-args-dispatcher.md` (accepts ADR 0014)

## Intent summary

Bare `agent-profile` on an interactive TTY detects the repository state
and offers the right action pre-selected; scripts and non-TTY callers
see today's behavior byte-identically.

## Behavior slice

In `runCli`, the bare-invocation path (currently: print help) gains an
interactive-TTY branch: evaluate the spec's seven states in priority
order (broken -> no profile -> never compiled -> drift -> stale ->
new capabilities -> current), render one clack select with the first
match pre-selected and every other applicable action listed, run the
chosen existing command in-process, exit with its code. Cancel exits 0
having run nothing. "Current" prints the up-to-date note with doctor/ui
offered. Non-TTY bare invocation prints help byte-identically and runs
no detection. Detection is assembled from the commands' own machinery
by import: scanner/import-report (states 1-2), lockfile read +
canonical-hash comparison (3-4), the real compile dry-run plan (5),
`computeOfferedCapabilities` (6).

## Non-goals

- Changing any subcommand, flag, help text, or exit code.
- New flags on the bare command; `--state --json` (recorded deferral).
- Loop-back menu after the action completes.
- Detection on non-interactive calls (not even read-only scans).
- New state classes beyond the spec table; the assist step.

## Acceptance criteria

Spec 004 acceptance criteria 1-9.

## Expected RED proof

State-matrix fixtures (one per table row) and the multi-state priority
fixtures fail against current bare behavior (help printed, no menu);
the exit-code passthrough test fails; the non-TTY help golden stays
green throughout.

## Expected GREEN proof

All nine criteria green: each fixture pre-selects the spec's action;
priority proven (broken beats everything; drift beats upgrade); non-TTY
byte-identity + no-detection sentinel; cancel exit 0 with nothing
written; passthrough of a failing action's exit code.

## Seam under test

The state-evaluation function (pure over injected repo fixtures) and
the menu flow via injected prompts/streams (phase-26 presenter
conventions). Routed commands run real against temp dirs.

## Allowed mock boundary

Temp-dir fixtures and injected prompts/streams only; never mock the
detection machinery (the binding rule is that it IS the commands'
machinery).

## Test command guidance

`npm run test --workspace @agent-profile/cli`; root `npm run check` and
`npm run lint`; `npm run verify:pack` (run regardless); golden suite
(non-TTY bare help byte-identical; no other fixture changes expected).

## Likely file ownership

- `apps/cli/src/index.ts` (bare-invocation branch in runCli)
- `apps/cli/src/dispatch.ts` or similar (state evaluation + menu;
  keep index.ts thin)
- tests; README quick-start; CHANGELOG

## Dependencies

`ready` (spec approved 2026-07-11). Standalone; no open work overlaps
`index.ts` right now.

## Contract impact

One new interactive behavior on the bare TTY path; every existing
surface frozen (binding: non-TTY bare help byte-identical, subcommands
untouched, exit-code passthrough).

## Security impact

Detection is read-only; the menu writes nothing; choosing an action
grants exactly what typing that command grants today (each command's
preview/consent defaults unchanged). No new dependencies, no telemetry.

## Documentation impact

README quick-start leads with bare `agent-profile`; CHANGELOG;
phase-27 README.

## Implementation context

Bare invocation currently prints help around `runCli`'s entry
(`apps/cli/src/index.ts` ~line 279 area). The clack lazy-import +
interactive-gate pattern is `wizard-clack.ts`/`presentation.ts`
(phase 26). State signals already exist as tested machinery:
`buildPhase14ImportReport`, `readLockfileForRegions`, the region
planner's canonical regeneration, the compile dry-run plan,
`computeOfferedCapabilities` (`@agent-profile/core`). The 27/001 parity
harness and 27/003 reconciliation fixtures provide ready-made state
fixtures. Field-test logs in the phase-27 findings review are the
reproduction scripts for the UX being fixed.

## Review expectations

Detection imports audited (no reimplemented state logic - the binding
rule); priority fixtures cover at least broken+drift and drift+upgrade
combinations; write-path sentinel green on menu and cancel paths;
non-TTY sentinel proves no clack evaluation and no detection; README
two-level story (bare for humans, verbs for scripts) present.
