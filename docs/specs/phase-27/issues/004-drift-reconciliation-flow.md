# I4: Compile drift classification flow

## Parent spec or request

`docs/specs/phase-27/003-drift-reconciliation.md`

## Intent summary

When interactive compile hits the hash-mismatch refusal, let the user
classify each drifted file and act on that intent through existing
ownership mechanisms - never guessing, never reverse-importing prose.

## Behavior slice

In interactive `compile` only, at the point `formatRegionAwareWriteRefusals`
would print a hash-mismatch refusal: show the per-file drift diff
(deterministically regenerated canonical bytes vs on-disk bytes) and a
classification menu. Root instruction files (`AGENTS.md`, `CLAUDE.md`) get
the four-way menu (shared intent -> relocate user lines into the
`AGENTS.md` manual region + restore generated region; client-specific ->
relocate into the file's own manual region; accidental -> restore
canonical + rehash; cancel default). All other drifted generated outputs
get two-way (keep -> reclassify `manual-owned`; restore canonical) plus
cancel. Unisolable interleaved edits refuse relocation and reduce to
keep/restore/cancel. One combined diff -> approve -> single atomic write;
cancel leaves everything untouched and prints the standard refusal for
unresolved files. Non-interactive compile is byte-identical to today.

## Non-goals

- Reverse-importing prose into `ai-profile.yaml` (ADR 0011).
- A separate reconcile command (ADR 0011).
- Region markers for non-root generated artifacts.
- Any change to non-interactive compile output, exit codes, or `--force`.
- Tabnine rendering of shared manual content (documented gap).

## Acceptance criteria

Spec 003 acceptance criteria 1-7.

## Expected RED proof

The classification fixture matrix (file kind x choice x lockfile
transition x resulting bytes) and the extractor units (clean additions,
interleaved-edit refusal) fail before the flow exists; non-interactive
drift goldens stay green throughout.

## Expected GREEN proof

Matrix green; the 27/001 parity fixtures extended so post-reconciliation
`init --import` agrees with compile on every touched file; non-interactive
compile byte-identical; write-path sentinel green for every cancel branch.

## Seam under test

`planRegionAwareWrites` refusal path + the new classifier/extractor
(pure over regenerated-canonical vs on-disk bytes); interactive flow via
injected prompts/streams (phase-26 presenter conventions). The
non-interactive refusal path (`formatRegionAwareWriteRefusals`) stays
untouched.

## Allowed mock boundary

Temp-dir fixtures and injected prompts/streams only; no mocks of the
compiler or lockfile.

## Test command guidance

`npm run test --workspace @agent-profile/compiler`,
`npm run test --workspace @agent-profile/cli`, root `npm run check` and
`npm run lint`, `npm run verify:pack` (a new source file in a published
package must be added to its `fixtures/npm-pack` allowlist), then the
golden suite. All are part of DONE - not just unit tests.

## Likely file ownership

- `apps/cli/src/index.ts` (interactive compile branch; the drift
  extractor/classifier may live in a new `apps/cli/src/reconcile.ts`)
- `packages/compiler/src/*` if the canonical-regeneration seam needs a
  pure export
- tests; `fixtures/npm-pack/*` if a published package gains a source file
- CHANGELOG, phase-27 README

## Dependencies

`ready` (003 approved 2026-07-08). Parallel-safe with I3 apart from
shared `apps/cli/src/index.ts` touchpoints - coordinate merges; if I3
lands first, rebase onto it.

## Contract impact

No new ownership states or lockfile schema change; classifications map to
existing `mixed` / `manual-owned` / rehash transitions. Non-interactive
compile and `--force` are byte-identical (binding).

## Security impact

No new write paths (existing region-aware planner + atomic write); no
network, dependencies, or telemetry; drifted content never uploaded;
restored bytes come only from the deterministic renderer.

## Documentation impact

README compile section (drift resolution), CHANGELOG, phase-27 README,
`--force` doc note ("prefer the interactive classification").

## Implementation context

Reconciliation is the interactive continuation of the refusal that
`planRegionAwareWrites` already produces (`apps/cli/src/index.ts`, the
`hash-mismatch` branch and `formatRegionAwareWriteRefusals`). The
canonical bytes for the diff come from the same deterministic render
compile already performs. `manual-owned` keep reuses the 27/001 lockfile
semantics verbatim. Reuse the phase-26 presenter for diffs/menus and the
write-path sentinel harness from 27/001.

## Review expectations

Every classification row cited to a test; extractor refusal proven by
fixture; write-path sentinel green on all cancel branches;
non-interactive compile byte-identity proven by golden; 27/001 parity
extended and passing; `verify:pack` run and green.
