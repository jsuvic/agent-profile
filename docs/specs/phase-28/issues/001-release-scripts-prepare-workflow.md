# I1: Release scripts + release-prepare workflow

## Parent spec or request

`docs/specs/phase-28/001-release-automation.md` (W1; Contracts; AC1, AC7)

## Intent summary

One dispatch produces a complete, verified bump PR; all release logic is
unit-tested script code, not workflow YAML.

## Behavior slice

New `scripts/release/*.mjs` modules with unit tests: changelog roll
(`Unreleased` -> `## <version> — <date>` + fresh empty `Unreleased`;
refuses when `Unreleased` is empty or the version heading already
exists), version/tag guard (semver shape, not already tagged), and
already-published check (registry lookup seam, mockable). New
`.github/workflows/release-prepare.yml` (`workflow_dispatch` with
`version` or `patch`/`minor` input): runs `sync-versions.mjs`, refreshes
the lockfile (`npm install --package-lock-only`), rolls the changelog,
runs `verify-package-metadata`, opens the bump PR. Refuses (clear
message, no branch/PR) when the target version is already tagged or
published.

## Non-goals

- Tagging (I2), publishing (I3), npm settings (I4).
- Changing `sync-versions.mjs` or `verify.yml`.

## Acceptance criteria

Spec AC1 and AC7 (script tests + docs pointer only; release.md rewrite
is I4).

## Expected RED proof

Unit tests for changelog roll (populated/empty/already-rolled), guard
matrix, and published-check fail before the scripts exist.

## Expected GREEN proof

Script tests green; a dry dispatch on a scratch branch produces the
exact bump-PR contents (versions, lockfile, changelog, fresh
Unreleased).

## Seam under test

Pure script functions over fixture files; the registry check behind an
injectable fetch (mock allowed at that seam only).

## Allowed mock boundary

The registry HTTP lookup only. Filesystem via temp fixtures.

## Test command guidance

Add a `test` entry point for `scripts/release` (root or a small runner);
then root `npm run check`, `npm run lint`. `verify:pack` unaffected (no
published-package source), but run it anyway per the phase-27 lesson.

## Likely file ownership

- `scripts/release/changelog-roll.mjs`, `guards.mjs`,
  `published-check.mjs` + tests
- `.github/workflows/release-prepare.yml`
- root `package.json` script entries

## Dependencies

`ready`. Parallel-safe with I2.

## Contract impact

No product surface. Workflow permissions: `contents: write` +
`pull-requests: write` for the bump PR only.

## Security impact

No npm credential; no secret reads; scripts print no env values.

## Documentation impact

Phase-28 README pointer; release.md rewrite deferred to I4.

## Implementation context

The 0.4.1 manual roll (this repo's CHANGELOG) is the reference shape.
`sync-versions.mjs` already handles all version propagation - do not
duplicate its logic; call it.

## Review expectations

Every guard row cited to a test; workflow YAML contains wiring only;
refusal paths produce no branch, PR, or partial edits.
