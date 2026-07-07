# Phase 26

Interactive CLI presentation layer: replace hand-rolled readline prompts
with `@clack/prompts@1.7.0` (arrow-key selects, grouped multiselects,
inline validation, spinners, progress, task log), add colored static output
via `node:util` `styleText`, a tiered logo, graceful cancellation, and an
in-wizard discovery step for the phase-20 `--assist` feature. Presentation
only: every non-interactive, `--json`, `--quiet`, and generated-file
surface stays byte-identical.

## Specs

- `001-clack-cli-presentation.md` - approved 2026-07-06; amended the same
  day to match the phase-20 flag pinning (PATH-only detection, Tabnine
  excluded from v1, degrade-reason classifier).

## Issues

- `issues/001-clack-adapter-cancel-contract.md` (WS1-I1)
- `issues/002-logo-framing-style.md` (WS1-I2)
- `issues/003-static-presentation.md` (WS2-I1)
- `issues/004-assist-wizard-step.md` (WS3-I1; blocked on phase-20 WS3-I3
  and the narrowed WS3-I6 checklist)

Task states are tracked in the root `TASKS.md` ledger.

## Decisions

- Library: @clack/prompts pinned 1.7.0; picocolors rejected in favor of
  Node built-in `styleText` (clack 1.1.0 made the same move).
- Logo tiering: half-block APC logotype for `init`, one-line glyph
  wordmark for repeat-run commands; boxed badge rejected (competing
  frames).
- Assist discoverability supersedes the phase-20 byte-identity clause for
  the interactive TTY branch only.
- Detection is PATH resolution only (2026-07-06): version probes dropped
  entirely; the single adapter invocation is the only spawn in an assist
  run. Client versions are therefore not shown in the wizard select.
- Adapter failures render fixed messages from a closed degrade-reason
  classifier (auth-required, usage-limit, ...) because subscription-
  authenticated clients are the common case; raw client text is never
  echoed (ASSIST-SEC-007).
