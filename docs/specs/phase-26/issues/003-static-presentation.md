# WS2-I1: Compile/doctor/ui static presentation

## Parent spec or request

`docs/specs/phase-26/001-clack-cli-presentation.md`

## Intent summary

Repeat-run commands get the same design language: spinners, progress,
colored severities, and a clearing task log - only on interactive TTY.

## Behavior slice

`compile`: timer spinner for scan+compile, write plan with colored
`+`/`~`/`=` lines, `progress` bar over the file-write loop, `log.success`
summary. `doctor`: colored `[error]`/`[warn]` severities, green no-issues
line, one-line count summary. `ui`: `taskLog` streaming server boot stdout
(cleared once the port binds, retained on crash, size-capped), url/posture
`note`. Wizard write phase uses `tasks` (named steps). All of it behind
the interactive-TTY gate; `--json`, `--quiet`, piped, and non-interactive
output byte-identical.

## Non-goals

- Wizard prompts (WS1-I1) and wizard framing (WS1-I2).
- Assist step (WS3-I1).
- Any change to doctor issue content, exit codes, or compile semantics.

## Acceptance criteria

Spec acceptance criteria 1, 2, 3, 8; frozen surfaces table; adopted
features rows for spinner/progress/tasks/taskLog/log.

## Expected RED proof

Unit tests for the colored doctor/plan formatters (including NO_COLOR)
fail; TTY-gating tests (piped run produces current byte-identical output)
fail if wired unconditionally.

## Expected GREEN proof

Formatter and gating tests pass; all existing `index.test.ts` and
`phase14.test.ts` expectations pass unmodified; goldens byte-identical.

## Seam under test

Pure formatters (`formatDoctorText` colored variant, plan-line formatter);
TTY gate via injected `CliIo`/stream flags; taskLog via a fake server
stream.

## Allowed mock boundary

Fake child-process stdout stream for the `ui` taskLog; injected TTY flags.
Never mock the compiler or doctor themselves.

## Test command guidance

`npm run test --workspace @agent-profile/cli`; golden suite; manual smoke
on Windows Terminal and legacy conhost (ASCII fallback).

## Likely file ownership

- `apps/cli/src/index.ts` (runCompile, runDoctorCommand, runUi call sites)
- `apps/cli/src/branding.ts` (shared accent/severity helpers from WS1-I2)
- `apps/cli/src/index.test.ts` additions

## Dependencies

WS1-I1 merged (lazy-load pattern and stream harness reused). `parallel-safe`
with WS1-I2 apart from `branding.ts`/`index.ts` overlap - prefer merging
WS1-I2 first.

## Parallelism notes

Touches `index.ts` alongside WS1-I2; coordinate or sequence.

## Contract impact

None to machine-readable surfaces (binding: byte-identical). Interactive
text for compile/doctor/ui changes; document divergence in the PR.

## Security impact

taskLog renders the already-spawned server's stdout only, size-capped; no
new child processes; no ANSI outside the interactive terminal.

## Documentation impact

README command examples; CHANGELOG.

## Implementation context

`formatDoctorText` and `formatWritePlan` in `apps/cli/src/index.ts` are the
existing pure text sources - add colored variants beside them rather than
mutating the frozen plain ones used by non-interactive paths.

## Review expectations

Frozen-surface goldens untouched; NO_COLOR and piped-output tests present;
spinner/progress appear only on TTY; taskLog crash path retains the log.
