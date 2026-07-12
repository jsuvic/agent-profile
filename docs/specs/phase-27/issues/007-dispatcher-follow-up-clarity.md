# I7: Dispatcher follow-up offers + doctor/upgrade clarity

## Parent spec or request

`docs/specs/phase-27/007-dispatcher-follow-up-and-clarity.md` (amends
ADR 0014)

## Intent summary

A first-contact user goes from broken repo to healthy inside one
`agent-profile` invocation, consenting step by step, with every menu
choice explained.

## Behavior slice

The spec's four binding behaviors:

1. Dispatcher follow-up chain (interactive TTY, dispatcher-only): after
   a routed action completes, re-evaluate state with the same imported
   machinery; if not "current", confirm the single highest-priority
   next action (default No). Accept -> run it (own consent gates) ->
   offer again. Offered-once-per-state bound stops recursion with a
   note. Decline or "current" -> exit with the last completed action's
   code. Direct subcommand invocations gain no follow-up.
2. Doctor recommendation summary (interactive TTY only): after the
   per-issue output, group actionable issues by fixing command /
   guidance into deduplicated recommendations with counts. Grouping
   keys off existing guidance text/codes - no new detection.
   Non-interactive doctor and --json byte-identical.
3. Upgrade clarity: relabel "Adopt recommended" -> "Adopt all
   available"; hints on all three options (keep: "change nothing and
   exit"; adopt-all: "add every listed capability to ai-profile.yaml";
   customize: "choose which capabilities to add"); the
   Available-capabilities note gains "Adopting adds entries to
   ai-profile.yaml only; run `agent-profile compile --write` afterward
   to generate the files." The --adopt-recommended flag keeps its
   spelling; --help describes it as adopting all offered.
4. Dispatcher menu logo: neutral `agent-profile` wordmark (the menu
   currently hardcodes formatLogo("doctor", ...) in dispatch-clack.ts
   ~line 38); the routed command's logo prints exactly once.

## Non-goals

- A loop-back action menu; auto-running without per-step confirmation.
- A recommended-subset feature (catalog flag is a future candidate).
- Renaming the --adopt-recommended CLI flag.
- Changes to doctor detection or upgrade insertion machinery.

## Acceptance criteria

Spec 007 acceptance criteria 1-6.

## Expected RED proof

The chain scenario test (broken-repo fixture shaped like the field log:
doctor -> offer compile --write -> accept -> chain), the offered-once
bound test, the doctor grouping unit test (10x LINT-OWN-001 +
LINT-STRUCT-003 + LINT-LOCK-001 + LINT-OWN-002 -> 3 recommendations),
the upgrade label/hint assertions, and the double-logo regression all
fail against 0.4.4 behavior. Frozen goldens stay green throughout.

## Expected GREEN proof

All six criteria green; non-interactive doctor/upgrade and --json
byte-identical; scripted --write --adopt-recommended behavior unchanged
(regression test); exit-code passthrough of the last completed action.

## Seam under test

Dispatcher chain via injected prompts/streams (extend the existing
dispatch.test.ts harness); doctor grouping as a pure function over a
DoctorIssue[] fixture; upgrade prompts via the injected UpgradePrompts.

## Allowed mock boundary

Temp-dir fixtures and injected prompts/streams only; never mock the
detection or doctor machinery.

## Test command guidance

`npm run test --workspace @agent-profile/cli`; root `npm run check` and
`npm run lint`; `npm run verify:pack` (run regardless); golden suite -
non-interactive doctor/upgrade byte-identical, any interactive-fixture
diffs enumerated in the CHANGELOG entry.

## Likely file ownership

- `apps/cli/src/dispatch.ts` / `dispatch-clack.ts` (chain, logo)
- `apps/cli/src/index.ts` (doctor summary call site, upgrade labels/
  hints/note, --help text)
- possibly a small pure `doctor-summary.ts` module + test
- tests; CHANGELOG under `## Unreleased` (never a hand-made version
  heading); README dispatcher section

## Dependencies

`ready` (spec approved 2026-07-12). Standalone.

## Contract impact

Frozen: non-interactive doctor/upgrade text, --json shapes, exit
codes, the --adopt-recommended flag, non-TTY bare help. New behavior is
interactive-only. ADR 0014 amendment already applied with approval.

## Security impact

No auto-execution: every chained action behind a fresh confirm with
default No; state re-evaluation between offers is read-only; no new
dependencies, commands, or network.

## Documentation impact

README dispatcher section (the chain); CHANGELOG; --help text for
--adopt-recommended.

## Implementation context

The field log driving this is in the phase-27 findings review
(2026-07-12, macOS user): dispatcher -> doctor -> 13 errors -> exit;
upgrade menu unexplained. "Adopt recommended" currently sets
`selected = offered` (apps/cli/src/index.ts, interactive upgrade flow
~line 540) - the relabel makes the UI match that. The dispatcher's
state evaluation and action-running seams are in dispatch.ts
(evaluateDispatchState / the routing switch); reuse them for the
re-evaluation between offers rather than adding a second path.

## Review expectations

No auto-run path (proven by test: every chained action preceded by a
confirm); offered-once bound proven; frozen surfaces byte-identical;
doctor grouping covers the field-log fixture exactly; the double-logo
regression test fails on 0.4.4 code and passes after; flag-behavior
regression green.
