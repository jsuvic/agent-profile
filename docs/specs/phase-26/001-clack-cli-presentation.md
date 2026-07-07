# Spec: Interactive CLI Presentation Layer (clack)

## Status

Approved 2026-07-06. Synthesized from the grill session of the same date:
library selection, version pin, feature-adoption review against the
@clack/prompts 1.x changelog, assist discoverability design, and logo
tiering. Binding as of approval.

## Problem

CLI interactivity is hand-rolled `node:readline`: selection means typing
number tokens ("2,3"), validation errors loop through stderr, there is no
color, no progress feedback, and Ctrl+C behavior is undefined (the process
dies mid-prompt with readline left open). The phase-20 `--assist` feature is
undiscoverable without reading documentation. The presentation does not match
the care invested in the decision logic behind it.

## Goal

An interactive TTY presentation layer built on `@clack/prompts@1.7.0`:
arrow-key selects, space-toggle multiselects with keyboard-instruction
footers, inline text validation, spinners with timers, progress bars, a
clearing task log for the UI server, colored static output via
`node:util` `styleText`, graceful cancellation everywhere, a tiered logo,
and an in-wizard assist discovery step - while every machine-readable and
non-interactive surface stays byte-identical to the current baseline.

## Intent

Presentation only. All decision logic, parsers, and contract-tested text
remain in pure functions; clack renders them. No new authority, no new write
paths, no new network access, no new child processes.

## Decision Rules

1. Surface doubt -> only the interactive TTY branch may change; anything a
   machine can parse is frozen (see Frozen Surfaces).
2. Logic/presentation doubt -> logic stays in pure `format*`/`parse*`
   functions; the clack layer is a thin adapter with no branching beyond
   rendering.
3. Cancel doubt -> a prompt cancel aborts the run ("Cancelled - no files
   written.", exit 0); an assist-invocation cancel degrades and the wizard
   continues (ASSIST-SEC-009). This asymmetry is intentional and binding.
4. Color doubt -> `node:util` `styleText` only; never raw ANSI literals;
   never a color dependency.
5. Feature doubt -> the Adopted Features table is closed; using an
   additional clack component is a spec change.

## Non-Goals

- Any change to non-interactive, CI, `--json`, or `--quiet` output.
- New wizard questions beyond the assist step (a recap-and-edit loop is
  deferred to a future spec).
- `path`, `date`, `multiline`, `password`, `selectKey`, or `stream`
  components.
- Standard Schema validator adoption (zod/arktype); hand-rolled validators
  stay.
- Full unicode support on legacy Windows conhost (ASCII fallback only).
- A TUI framework (ink), theming options, or user-configurable colors.

## Dependencies (binding)

- `@clack/prompts` pinned exactly `1.7.0` (transitively `@clack/core@1.4.3`,
  `fast-string-width`, `fast-wrap-ansi`, `sisteransi`). ESM-only; no CJS
  interop shim may be added.
- No other new runtime dependency. Static color uses `styleText` from
  `node:util` (Node >= 24 already required), which honors `NO_COLOR`,
  `FORCE_COLOR`, and non-TTY streams natively.
- Lazy loading: the clack-backed module is imported with a dynamic
  `await import()` only after the existing `isNonInteractive` gate passes.
  Non-interactive runs must never evaluate the clack module.
- 1.x API notes fixed here because 0.x documentation is widespread:
  `multiselect` takes `initialValues` (plural); spinner exposes
  `stop()`/`cancel()`/`error()` (no `stop(code)`); `note` accepts a
  per-line `format` option.

## Adopted Features (binding UX contract)

| Clack feature | Where used |
| --- | --- |
| `intro` / `outro` | Every interactive command: branded opening bar, closing next-steps line |
| `spinner` (`indicator: "timer"`) | Wizard repo scan, compile step, doctor run, UI port-bind wait, assist invocation |
| `spinner.error` / `cancelMessage` / `errorMessage` | Deterministic assist degrade and failure states |
| `note` (with `format`) | Detected-stack summary, write plan (colored `+`/`~`/`=` lines), gitignore entries, assist summary, consent notice, UI url/posture block |
| `log.info/warn/error/success/step` | Recommendation warnings, doctor severities, success summaries, "no AI CLI found" hint |
| `select` | Strategy, setup profile, preview-vs-write confirmation, assist client choice |
| `multiselect` (`initialValues`) | Client selection, detected clients pre-checked |
| `groupMultiselect` (`groupSpacing`, `maxItems`) | Capability packs under Recommended / Optional groups, scrolling |
| Keyboard-instruction footers | Left at 1.6/1.7 defaults; `showInstructions` must not be disabled |
| `confirm` | Gitignore update, manual-language entry, assist consent (default No) |
| `text` + `validate` | Manual language slugs; `parseManualLanguageSlugs` wired into `validate` |
| `autocomplete` | Language slug entry suggesting from the known-slug list (optional within WS1) |
| `progress` | File-write loops (compile `--write`, wizard write phase) |
| `tasks` | Wizard write phase as named steps: create profile -> generate client files -> update .gitignore |
| `taskLog` | `ui` command: streams server boot stdout, clears on success, retained on failure |
| `group` + `onCancel` | Wizard orchestration with one central cancel handler |
| `isCancel` / `cancel` | Graceful abort at every prompt |
| `AbortSignal` | One controller drives assist timeout and deterministic test abortion |
| `spinner` `styleFrame` | Optional accent-tinted frames (polish, may be dropped without spec change) |

Explicitly not used: `password` (secrets are deny; absence is deliberate),
`path`, `date`, `multiline`, `selectKey`, `stream`, Standard Schema
`validate`, `withGuide: false`, `showInstructions: false`.

## Logo (binding)

- One pure function `formatLogo(command, version, unicode)` is the only
  source of logo text.
- `init`: two-line half-block "APC" logotype, name, tagline
  ("one profile, three agents"), version.
- `compile` / `doctor` / `ui`: single-line glyph wordmark
  (`<glyph> agent-profile · <command> · v<version>`).
- `unicode === false`: init falls back to the wordmark style; the glyph
  falls back to `*`. Detection follows the same signal clack uses for its
  own symbol fallback.
- Rendered only in the interactive TTY branch; never in `--json`,
  `--quiet`, piped, or non-interactive output.
- One accent color for the logo glyph/logotype via `styleText`; clack's own
  symbol colors (active/submit/cancel/error) are not overridden.

## Assist Wizard Step (binding; supersedes one phase-20 clause)

- Supersession: phase-20/001 fixes "`init` without `--assist` is
  byte-identical to phase-12/007 behavior". This spec narrows that clause to
  the non-interactive branch: non-interactive no-flag `init` remains
  byte-identical (golden-enforced); the interactive TTY branch may add the
  assist step. All other phase-20 contracts (ASSIST-SEC-001..010, consent
  wording requirements, degrade behavior) are unchanged.
- Detection (amended 2026-07-06 to match the pinned threat model):
  PATH resolution only for claude and codex (Tabnine is excluded from v1),
  performed during the initial scan. No child process is spawned before
  explicit consent; the single adapter invocation is the only spawn in an
  assist run. Version incompatibility surfaces as a non-zero adapter exit
  and degrades.
- Clients found -> one `select` after the Detected note and before the
  setup-profile question (assist pre-fills setup profile and capability
  packs, so it must precede them): options are "Skip (default)" plus one
  entry per client found on PATH (names only; no version is shown because
  no probe runs). Choosing a client shows the phase-20 consent notice
  (literal wording in `002-init-assist-threat-model.md`) as a `note`
  followed by a `confirm` defaulting to No. Only an explicit Yes invokes
  the adapter (ASSIST-SEC-001 preserved).
- No clients found -> a single `log.info` line; no prompt, no install
  nudge beyond an optional outro next-steps mention.
- Invocation renders as a timer spinner. Timeout, non-zero exit, empty or
  invalid output -> `spinner.error` with the fixed message for the matched
  degrade reason from the closed classifier in
  `002-init-assist-threat-model.md` (`auth-required`, `usage-limit`,
  `timeout`, `invalid-output`, `oversize`, `client-error`); the wizard
  continues as normal init (ASSIST-SEC-009). Auth and usage-limit degrades
  are expected in normal operation (subscription-authenticated clients).
  Assistant stdout and stderr are never rendered (ASSIST-SEC-007).
- Cancel asymmetry: Ctrl+C during the assist invocation aborts the adapter
  (via the shared `AbortSignal`) and continues the wizard; Ctrl+C at any
  prompt aborts the run.
- Accepted recommendations appear as `(suggested)` hints on pre-selected
  options in later prompts; the user can change every one.
- Sequencing: this step lands only after phase-20 WS3-I3 (client detection
  and adapters) is unblocked by the threat-model sign-off (phase-20 WS3-I6).
- The `--assist` flag continues to work as the scripted entry to the same
  gated path.

## Message Style Guide (binding)

- Sentence case; verb-first questions; no exclamation marks; no "please".
- Hints and defaults in parentheses within the option label or `hint`
  field, not appended to the question.
- Keyboard instructions come from clack defaults, never restated in
  question text.
- Error messages from `validate` state what is wrong and what valid input
  looks like.

## Frozen Surfaces (binding)

| Surface | Status |
| --- | --- |
| `--json` output (init, doctor) | Frozen, byte-identical |
| `--quiet` output | Frozen, byte-identical |
| Non-interactive text output (CI, no TTY, `--non-interactive`) | Frozen, byte-identical |
| Golden fixtures and generated files | Frozen (this spec changes no generated artifact) |
| Exit codes for existing paths | Frozen |
| Interactive TTY rendering | Free to change under this spec |

New exit-code contract: a user cancel at any prompt exits 0 after printing
the cancel line, having written nothing.

## Contracts (binding)

- The `CliPrompts` seam is preserved: `runInitWizard`'s signature and the
  prompt-callback types do not change; existing wizard tests pass
  unmodified. The clack adapter is a new `CliPrompts` implementation.
- `format*` / `parse*` functions remain pure and remain the only source of
  contract-tested text; the clack layer renders their output.
- The write confirmation keeps "Preview only" first and default.
- Capability packs: unavailable options are omitted from the
  `groupMultiselect` and explained with one `log.warn`, not shown disabled.
- The wizard produces the same `WizardOutcome` for the same sequence of
  answers as the readline implementation did (semantic parity; wording is
  free, options and defaults are not).
- UX divergence record: the implementation PR must list every reworded
  question against its old text (AGENTS.md final-review rule 7), once, in
  the PR description.

## Security Rules

- No secret prompts; the `password` component is never imported.
- No raw ANSI escapes or color codes in any generated file, log file, or
  machine-readable output; color exists only on the interactive terminal.
- ASSIST-SEC-001..010 are unchanged; the presentation layer introduces no
  new sink for assistant text (spinner/note/log messages for assist are
  APC's own deterministic strings only).
- No child processes beyond phase-20's single adapter invocation
  (detection is PATH resolution only, no pre-consent spawn); the taskLog
  for `ui` renders the already-spawned server's stdout only, size-capped.
- No APC-initiated network access at runtime.

## Acceptance Criteria

1. Non-interactive `init`, `compile`, `doctor`, and `ui` output is
   byte-identical to the pre-change baseline (golden).
2. `--json` and `--quiet` outputs are byte-identical (golden).
3. Non-interactive runs never evaluate the clack module (runtime sentinel).
4. The interactive wizard reaches every phase-12/007 decision and produces
   a `WizardOutcome` semantically identical to the readline flow for
   equivalent answers; existing wizard and index tests pass unmodified.
5. Cancel at every prompt: exit 0, cancel line printed, no file writes
   (write-path sentinel).
6. Assist step appears only when PATH resolution finds a client; no child
   process runs before explicit consent; consent defaults to decline;
   decline and every degrade condition continue as normal init with the
   fixed classifier message; no assistant text reaches the terminal (echo
   sentinel).
7. The logo renders only on interactive TTY; `unicode: false` produces the
   documented ASCII fallback; `formatLogo` is deterministic.
8. `NO_COLOR=1` (or a non-TTY stream) strips all color from static output.
9. Prompt-order contract: assist step (when shown) precedes setup-profile
   and capability questions; all other question order matches phase-12/007.
10. Exactly one new runtime dependency (`@clack/prompts@1.7.0`) appears in
    the lockfile.

## Tests

- Unit: `formatLogo` matrix (command x unicode); colored write-plan line
  formatter under `NO_COLOR` and forced-color; message-style assertions on
  question option/default structures.
- Adapter: drive each clack prompt with injected input/output streams and
  `AbortSignal`; assert returned values and cancel propagation per prompt
  type.
- Cancel contract: abort at each wizard step -> `confirmed: false`, exit 0,
  no writes (write-path sentinel reused from phase-20 harness).
- Assist step matrix: zero/one/two PATH-resolved clients; skip default;
  consent decline default; adapter timeout/non-zero/empty and each
  degrade-reason classification (auth-required, usage-limit via stderr
  fixtures) -> fixed message, wizard continues; echo sentinel on
  spinner/note/log content; no-spawn-before-consent sentinel.
- Runtime sentinel: `--non-interactive` and CI-env runs complete with the
  clack module unloaded (module-registry check).
- Golden: all frozen surfaces re-run against existing fixtures unchanged.

## Documentation Updates

- README CLI section: wizard walkthrough, new screenshots/casts.
- `docs/` init wizard page: assist step, cancel behavior, NO_COLOR note.
- CHANGELOG entry; phase-20 spec gains a pointer to the supersession note.

## Issue Plan

- WS1-I1: dependency pin, lazy-load gate, clack `CliPrompts` adapter,
  cancel contract, AbortSignal plumbing. `ready`
- WS1-I2: logo (`formatLogo`), intro/outro framing, detected/plan notes,
  message-style pass over question text. `sequenced` after WS1-I1.
- WS2-I1: compile spinner + progress + colored write plan; doctor colored
  severities + summary; `ui` taskLog + url note. `parallel-safe` with
  WS1-I2.
- WS3-I1: assist wizard step (detection select, consent gate, degrade
  rendering). `blocked` on phase-20 WS3-I3/WS3-I6 threat-model sign-off.

## TDD Strategy

RED: `formatLogo` tests, cancel-contract tests, runtime sentinel, and
adapter stream tests fail before the adapter exists; golden suite passes
throughout (frozen surfaces never go red). GREEN per issue in plan order.

## Final Review Checklist

- Spec-to-test matrix covers every binding section above.
- Frozen-surface goldens byte-identical; lockfile shows exactly one new
  dependency.
- UX divergence record present in the PR description.
- No `password`/`path`/`date`/`multiline`/`selectKey`/`stream` import
  anywhere in `apps/cli`.
- Runtime sentinels (clack unloaded, write-path, echo, execution) green.
