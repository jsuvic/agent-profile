# ADR 0014: Dispatcher As A Router, Never A Replacement

## Status

Accepted 2026-07-11 with phase-27/004 spec approval.

Amended 2026-07-12 with phase-27/007 approval: the no-loop-back-menu
rejection stands, but field evidence (a first-contact user on 0.4.4
routed to doctor, handed 13 raw errors, and exited - forced to re-run
and re-choose for every recovery step) added a consent-gated follow-up
chain inside the dispatcher: after a routed action completes, the state
is re-evaluated and the single highest-priority next action is offered
as a confirm (default No). Each state is offered at most once per
invocation (no infinite chains); decline exits with the last completed
action's exit code; direct subcommand invocations gain no follow-up.
This preserves the original rationale (one invocation = deliberate
consent per mutation; exit codes stay meaningful) while removing the
re-run-and-re-choose toil the original decision did not foresee.

## Context

Field tests (0.4.1/0.4.2) showed users guessing which command fits the
repository's state - init on an existing profile, upgrade before any
lockfile existed, compile in dry-run believing it wrote. The request
"unite agent-profile so we do not execute different parameters" admits
two readings: a state-aware router in front of the existing commands, or
one adaptive command that absorbs them.

## Decision

Bare `agent-profile` on an interactive TTY becomes a router: it detects
the repository state (reusing the commands' own state machinery, never a
parallel implementation), offers the matching action pre-selected in one
menu, runs the chosen existing command in-process, and exits with that
command's code. The subcommands remain first-class and unchanged;
non-TTY bare invocation keeps printing help byte-identically with no
detection run; the bare command gains no flags. A machine-readable state
report (`--state --json`) is deliberately deferred as a recorded
non-goal.

## Rationale

The router gives humans the two-word experience - the menu means nobody
needs to remember a verb - while scripts, CI, generated "next step"
guidance, and documentation keep explicit commands with explicit consent
semantics. The replacement reading was rejected: it breaks every
existing script and the generated artifacts' own guidance, dissolves the
frozen-surface contracts defended since phase 26, and hides commands
with different safety postures (upgrade edits the user-owned profile;
compile writes generated files) behind one implicit decision-maker,
against the product's explicit-contracts principle. Run-once-and-exit
was chosen over a loop-back menu because each command's outro is already
the state-aware "what next" layer (0.4.3), and one invocation = one exit
code is what shells expect.

## Consequences

Positive:

- Two entry styles, each optimal: bare command for humans, verbs for
  automation.
- Zero new contracts: one new interactive behavior, all frozen surfaces
  intact.
- Detection reuse makes router truth identical to command truth by
  construction.

Negative:

- Docs must maintain the two-level story (bare first, verbs for
  scripting).
- State detection on the TTY path costs a read-only scan plus a dry-run
  render before the menu appears.
- The deferred `--state --json` will resurface if editors/CI want
  machine-readable state.
