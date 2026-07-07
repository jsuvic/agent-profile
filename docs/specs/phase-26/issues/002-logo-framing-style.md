# WS1-I2: Logo, intro/outro framing, message-style pass

## Parent spec or request

`docs/specs/phase-26/001-clack-cli-presentation.md`

## Intent summary

The wizard reads as a designed product: tiered logo, intro/outro frame,
detected-stack and write-plan notes, consistent question wording.

## Behavior slice

`formatLogo(command, version, unicode)` pure function: two-line half-block
"APC" logotype + name + tagline for `init`; single-line glyph wordmark for
`compile`/`doctor`/`ui`; documented ASCII fallbacks. `intro`/`outro`
framing for the wizard; detected-stack summary and write plan rendered as
`note` (write plan lines colored `+`/`~`/`=` via `node:util` `styleText`
through the `format` option); recommendation warnings via `log.warn`.
Question wording pass per the spec's message style guide. Logo renders in
the interactive TTY branch only, one accent color, clack symbol colors
untouched.

## Non-goals

- Prompt mechanics and cancel handling (WS1-I1).
- compile/doctor/ui presentation (WS2-I1; the logo function lands here,
  its call sites for those commands land there).
- Assist step (WS3-I1).

## Acceptance criteria

Spec acceptance criteria 1, 2, 7, 8; message style guide; logo rules
section.

## Expected RED proof

`formatLogo` unit matrix (command x unicode) fails before the function
exists; NO_COLOR assertion on the colored write-plan formatter fails.

## Expected GREEN proof

Matrix and NO_COLOR tests pass; frozen-surface goldens byte-identical;
existing tests pass unmodified.

## Seam under test

Pure functions: `formatLogo`, colored plan-line formatter. Rendering calls
verified via the WS1-I1 stream harness.

## Allowed mock boundary

None for the pure functions; injected streams for rendering.

## Test command guidance

`npm run test --workspace @agent-profile/cli`; golden suite after.

## Likely file ownership

- `apps/cli/src/branding.ts` (new: `formatLogo`, accent helpers)
- `apps/cli/src/branding.test.ts` (new)
- `apps/cli/src/wizard-clack.ts` (framing, notes)
- `apps/cli/src/wizard.ts` (question text updates in `formatWizard*`)

## Dependencies

WS1-I1 - `sequenced`.

## Parallelism notes

Shares `wizard-clack.ts` with WS1-I1 (hard dependency) and `branding.ts`
with WS2-I1 (merge this before WS2-I1 or coordinate).

## Contract impact

Question wording changes are presentation-only; options, defaults, and
`WizardOutcome` semantics unchanged (binding). UX divergence record
required in the PR description (every reworded question against old text).

## Security impact

No color or ANSI in any generated file or machine-readable output;
`styleText` only, no color dependency.

## Documentation impact

README CLI section, init wizard docs page, CHANGELOG entry.

## Implementation context

Logo tiering decision and rejected boxed-badge variant are recorded in the
phase-26 README. Unicode fallback detection follows the same signal clack
uses for its own symbols.

## Review expectations

`formatLogo` deterministic and fully matrix-tested; no logo output in any
non-TTY path; UX divergence record present; style-guide conformance spot
check across all questions.
