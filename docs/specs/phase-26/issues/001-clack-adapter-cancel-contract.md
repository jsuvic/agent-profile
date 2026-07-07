# WS1-I1: Clack adapter, lazy-load gate, cancel contract

## Parent spec or request

`docs/specs/phase-26/001-clack-cli-presentation.md`

## Intent summary

The interactive wizard runs on `@clack/prompts@1.7.0` behind the existing
`CliPrompts` seam; non-interactive runs never load clack; Ctrl+C at any
prompt exits 0 with nothing written.

## Behavior slice

A new clack-backed `CliPrompts` implementation (select, multiselect,
groupMultiselect with `groupSpacing`/`maxItems`, confirm, text with
`validate` wired to `parseManualLanguageSlugs`), constructed only via a
dynamic `await import()` after the `isNonInteractive` gate passes. A single
`AbortController` threads through all prompts. `isCancel` on every answer
maps to a `WizardCancelled` signal caught once in `dispatchInitWizard`:
prints the cancel line, exits 0, writes nothing. `multiselect` uses
`initialValues` (1.x plural). Keyboard-instruction footers stay at clack
defaults (`showInstructions` untouched).

## Non-goals

- Logo, intro/outro framing, notes, message rewording (WS1-I2).
- Static color, spinner, progress, taskLog for compile/doctor/ui (WS2-I1).
- Assist wizard step (WS3-I1).
- Any change to `runInitWizard`, parsers, or `format*` functions beyond
  what the adapter consumes.

## Acceptance criteria

Spec acceptance criteria 1, 2, 3, 4, 5, 8, 10.

## Expected RED proof

Adapter stream tests (each prompt type driven via injected input/output
streams) fail before the adapter exists; the runtime sentinel (clack module
unloaded in `--non-interactive` runs) fails if wired eagerly; cancel tests
(abort at each step -> `confirmed: false`, exit 0, no writes) fail.

## Expected GREEN proof

All of the above pass; existing `wizard.test.ts` and `index.test.ts` pass
unmodified; frozen-surface goldens byte-identical.

## Seam under test

`CliPrompts` implementations driven via injected streams and `AbortSignal`;
`dispatchInitWizard` cancel handling via injected prompts that throw
`WizardCancelled`.

## Allowed mock boundary

Injected input/output streams and fake `CliPrompts` only; never mock clack
internals.

## Test command guidance

`npm run test --workspace @agent-profile/cli`; golden suite after.

## Likely file ownership

- `apps/cli/src/wizard-clack.ts` (new)
- `apps/cli/src/wizard.ts` (retire or delegate `createDefaultPrompts`)
- `apps/cli/src/index.ts` (`dispatchInitWizard` lazy import + cancel catch)
- `apps/cli/src/wizard-clack.test.ts` (new)

## Dependencies

None - `ready`. `@clack/prompts@1.7.0` is installed (exact pin).

## Parallelism notes

WS1-I2 and WS2-I1 both touch `index.ts`; merge this first.

## Contract impact

`CliPrompts` seam unchanged; new binding cancel contract (exit 0, cancel
line, no writes); ESM-only dependency (no CJS interop shim).

## Security impact

`password` component never imported; no new dependency beyond the pin; no
raw ANSI anywhere.

## Documentation impact

None in this slice (WS1-I2 carries the docs pass).

## Implementation context

The wizard's injected-prompt tests are the regression net: the adapter is a
thin rendering layer and must contain no decision logic. Spinner API is
1.x three-method (`stop`/`cancel`/`error`); `note` accepts per-line
`format` (used in WS1-I2).

## Review expectations

Existing wizard/index tests pass byte-unmodified; runtime sentinel proves
lazy loading; every prompt type covered by a stream-driven test including
cancel; preview-default write confirmation preserved.
