# Spec: No-Args Interactive Dispatcher

## Status

Approved 2026-07-11. Synthesized from the grill-change agreement record
of the same date (four decisions), with the 0.4.1/0.4.2 field-test logs
as the evidence base. Accepts ADR 0014.

## Problem

Users must know which command to run in which repository state. The
0.4.2 field test showed the cost: init -> upgrade -> "run compile" ->
dry-run -> upgrade again, guessing at every step. Bare `agent-profile`
prints help, which answers "what exists" but not "what now". The 0.4.3
flow fixes made each command's guidance state-aware; the remaining gap
is the entry point itself.

## Goal

Bare `agent-profile` on an interactive TTY detects the repository state
and offers the right action pre-selected in one menu. Humans type two
words; scripts and CI keep the explicit subcommands unchanged.

## Intent

A router, not a replacement (ADR 0014): the dispatcher sequences
existing commands and adds exactly one new behavior (the interactive
menu) and zero new contracts.

## Decision Rules

1. State doubt -> reuse the commands' own state computations; the
   router never grows parallel "what state is this repo in" logic
   (the 27/001 lesson: parallel state logic is how init and compile
   came to disagree).
2. Priority doubt -> correctness before freshness before growth
   (broken -> missing -> uncompiled -> drift -> stale -> upgrade ->
   current).
3. Surface doubt -> frozen: non-TTY bare output stays byte-identical
   help with no detection run; the bare command gains no flags.
4. Flow doubt -> one invocation, one action, one exit code; the
   commands' state-aware outros are the "what next" layer.

## Non-Goals

- Replacing, deprecating, or altering any subcommand (Path B rejected;
  ADR 0014).
- A machine-readable state report (`--state --json`) - deferred
  deliberately; it would create a new frozen surface nothing needs yet.
- A loop-back menu after the action completes.
- Any new flags on the bare command; `agent-profile <anything>` parses
  exactly as today.
- State detection in non-interactive contexts (not even read-only
  scanning; CI help calls stay free).
- The assist step (phase-26 WS3-I1) and any new state classes beyond
  the table below.

## Behavior (binding)

Bare `agent-profile` on an interactive TTY (`isInteractiveTty`, the
phase-26 gate) evaluates these states in priority order; the first
match is the pre-selected menu entry, and every other applicable
action is listed below it so the user can override. Cancel (Ctrl+C or
explicit) exits 0 having run nothing.

| Priority | State | Detection signal | Pre-selected action |
| --- | --- | --- | --- |
| 1 | Broken | doctor-level errors: damaged region markers, lockfile parse failure, conflicts | Check setup health (`doctor`) |
| 2 | No profile | `ai-profile.yaml` absent | Set up this repo (`init`) |
| 3 | Never compiled | profile present, `ai-profile.lock` absent | Generate agent files (`compile --write`) |
| 4 | Drift | lockfile-owned outputs' hashes differ from disk | Review edited files (interactive `compile`, 27/003 reconciliation) |
| 5 | Stale outputs | compile dry-run plan shows creates/changes | Refresh agent files (`compile --write`) |
| 6 | New capabilities | lockfile `catalogVersion` < `CAPABILITY_CATALOG_VERSION`, or field absent | Adopt new capabilities (`upgrade`) |
| 7 | Current | none of the above | "Everything up to date" note; `doctor`/`ui` offered; exit 0 |

- Choosing an entry runs the existing command in-process with its own
  flow, prompts, previews, and consent defaults unchanged; the router
  exits with that action's exit code.
- Detection reuses the commands' own machinery: the scanner and import
  report (states 1-2), lockfile reads and canonical-hash comparison
  (3-4), the real compile dry-run plan (5), and
  `computeOfferedCapabilities` (6). Detection is read-only; the menu
  itself writes nothing.
- Non-TTY / piped / CI bare invocation prints today's help
  byte-identically and runs no detection.
- Presentation follows phase-26 conventions: clack lazily imported
  behind the interactive gate, logo/wordmark, styleText color.

## Inputs

Repository state (profile, lockfile, on-disk outputs, capability
catalog). No new config or flags.

## Outputs

One interactive menu; then the chosen command's normal output. No new
files, reports, or formats.

## Contracts (binding)

- Non-TTY bare output byte-identical to current help (golden).
- All subcommand parsing, flags, help text, exit codes: untouched.
- Detection functions are the same ones the routed commands execute -
  by import, not by copy.
- The menu performs no writes and no network; every mutation happens
  inside the chosen command under its existing preview/consent
  defaults.
- No new dependencies; clack/branding reuse only.
- Exit codes: cancel or "current" -> 0; otherwise the chosen action's
  own code, unmodified.

## Security Rules

- Read-only until the user picks an action; picking an action grants
  nothing beyond what typing that command grants today.
- No state detection (thus no repo reads) on non-interactive bare
  calls.
- No telemetry; no new surfaces.

## Acceptance Criteria

1. Fresh empty repo -> menu pre-selects init; choosing it enters the
   existing wizard.
2. Profile without lockfile -> pre-selects compile --write.
3. Drift fixture (27/003 harness) -> pre-selects the reconciliation
   compile; stale-only fixture -> pre-selects refresh.
4. Older/absent catalogVersion -> pre-selects upgrade.
5. Broken-markers fixture -> pre-selects doctor even when other states
   also hold (priority proof); a drift+upgrade fixture pre-selects
   drift with upgrade listed.
6. Fully current repo -> up-to-date note, doctor/ui offered, exit 0.
7. Non-TTY bare invocation: byte-identical help, and the runtime
   sentinel proves no clack evaluation and no detection run.
8. Cancel at the menu -> exit 0, nothing written, no command run.
9. Exit-code passthrough: a routed command's failure code is the
   process exit code.

## Tests

- State-matrix fixtures reusing the 27/001 parity and 27/003
  reconciliation harnesses (one fixture per table row, plus the
  multi-state priority fixtures).
- Menu flow via injected prompts/streams (phase-26 presenter
  conventions), including cancel.
- Golden: non-TTY bare help unchanged; clack runtime sentinel extended
  to the bare path.
- Exit-code passthrough unit test with an injected failing action.

## TDD Strategy

RED: the state-matrix and priority fixtures fail against current bare
behavior (help printed, no menu); the non-TTY golden stays green
throughout. GREEN: detection assembly from imported machinery, then the
menu wiring.

## Documentation Updates

- README quick-start leads with bare `agent-profile` as the human entry
  point, subcommands as the scripting layer.
- CHANGELOG; phase-27 README.

## Issue Plan

- I6: dispatcher (detection assembly + menu + tests + docs). Single
  issue; brief on approval.

## Final Review Checklist

- Spec-to-test matrix over acceptance criteria 1-9.
- Non-TTY byte-identity and no-detection sentinel proven by test.
- Detection imports audited: no reimplemented state logic.
- Menu-writes-nothing proven via the write-path sentinel.
- ADR 0014 accepted alongside this spec.
