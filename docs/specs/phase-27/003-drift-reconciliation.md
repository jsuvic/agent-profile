# Spec: Drift Intent Reconciliation

## Status

Approved 2026-07-08. Synthesized from the grill-change agreement record of
the same date (four decisions). Accepts ADR 0011.

## Problem

A hash mismatch on a lockfile-owned generated file may be an intentional
user edit, but compile's only answers are refuse or `--force` (overwrite
everything). Users cannot express what the edit meant, and manually
copying client-specific content across clients propagates content
wrongly.

## Goal

When interactive compile hits the hash-mismatch refusal, show the drift
diff per file and let the user classify the edit; APC acts on the
classification through existing ownership mechanisms (manual regions,
mixed ownership, `manual-owned` reclassification, canonical restore) -
never guessing intent and never reverse-importing prose.

## Intent

Drift resolution becomes the interactive continuation of the moment the
user already cares about (compile failing), with cancel as the default
and every outcome routed through diff -> approve -> single atomic write.

## Decision Rules

1. Intent doubt -> ask; never infer a classification.
2. Destination doubt -> manual regions, never `ai-profile.yaml`.
3. Surface doubt -> compile's interactive branch, never a new command.
4. Artifact doubt -> no manual region means the two-way tier.

## Non-Goals

- Reverse-importing free text into `ai-profile.yaml` (ADR 0011).
- A separate reconcile command (ADR 0011).
- Region markers for non-root generated artifacts.
- Any change to non-interactive compile output, exit codes, or `--force`.
- Rendering shared manual content into Tabnine guidelines (documented
  gap, stated in the flow).

## User Flow

1. Interactive `compile` (dry-run or write) detects hash-mismatched
   lockfile-owned files where it would print the refusal today.
2. Per drifted file, batched one file at a time: show the drift diff
   (deterministically regenerated canonical bytes vs on-disk bytes), then
   the classification menu.
3. Root instruction files (`AGENTS.md`, `CLAUDE.md`) - four-way menu:
   - Shared intent: relocate the user's lines into the `AGENTS.md`
     manual region (adopting into mixed ownership); restore the
     generated region to canonical. Inheritance carries the content to
     Claude and Codex; the Tabnine gap is stated inline.
   - Client-specific override: same relocation, but into the drifted
     file's own manual region.
   - Accidental drift: restore canonical bytes; refresh the lockfile
     hash.
   - Cancel (default): leave the file and the refusal in place.
4. All other drifted generated outputs (skills, subagents, client
   configs, Tabnine guidelines) - two-way menu plus cancel:
   - Keep: reclassify the file `manual-owned` in the lockfile; APC stops
     regenerating it (27/001 semantics apply from then on).
   - Restore canonical: overwrite; refresh the hash.
5. If the user's lines cannot be isolated from the canonical text
   (interleaved edits), relocation is refused for that file with an
   inline explanation; the menu reduces to keep / restore / cancel.
6. One combined diff -> approve -> single atomic write at the end; any
   cancel mid-flow leaves everything untouched and prints the standard
   refusal for unresolved files.
7. Non-interactive compile: today's refusal text and exit code,
   byte-identical.

## Inputs

`ai-profile.lock` (ownership + hashes), on-disk drifted files,
deterministically regenerated canonical outputs (already available to
compile), user classifications.

## Outputs

Per classification: mixed-ownership root files with relocated manual
regions, `manual-owned` lockfile reclassifications, restored canonical
files with refreshed hashes; a reconciliation summary in the compile
output.

## Contracts (binding)

- Classification outcomes map to exactly the lockfile transitions above;
  no new ownership states, no lockfile schema change.
- Relocated user lines are byte-preserved inside the destination manual
  region (no rewrapping, no normalization).
- The relocation extractor requires a clean separation: user lines must
  be recoverable as additions/edits against regenerated canonical bytes;
  otherwise refuse relocation (flow step 5) - never approximate.
- After relocation, the file is `mixed` and the 27/001 behavior table
  governs it in both init and compile (parity holds by construction).
- Cancel is the default at every prompt; `--force` semantics are
  unchanged and bypass the flow entirely.
- Frozen surfaces: non-interactive compile, `--json`/`--quiet` paths,
  goldens, exit codes - byte-identical.

## Security Rules

- No new write paths: every outcome uses the existing region-aware
  planner and atomic write.
- No network, no new dependencies, no telemetry; drifted content is
  never uploaded or sent anywhere.
- Restored canonical bytes come from the deterministic renderer, never
  from any external source.

## Acceptance Criteria

1. Four-way flow on a drifted `AGENTS.md`: each classification produces
   its exact lockfile transition and file bytes (fixture matrix); shared
   relocation lands the user's lines byte-identically in the `AGENTS.md`
   manual region with the generated region canonical.
2. Client-specific on drifted `CLAUDE.md` -> relocation into `CLAUDE.md`'s
   own manual region only.
3. Two-way flow on a drifted skill file: keep -> `manual-owned` entry,
   file untouched, subsequent compile preserves it (27/001 parity);
   restore -> canonical bytes + refreshed hash.
4. Interleaved-edit fixture -> relocation refused with the inline
   explanation; keep/restore/cancel still work.
5. Cancel at any point -> tree and lockfile byte-identical; standard
   refusal printed for unresolved files.
6. Non-interactive compile with drift -> byte-identical to current
   refusal output and exit code.
7. Post-reconciliation `init --import` report agrees with compile about
   every touched file (extends the 27/001 parity fixtures).

## Tests

- Classification fixture matrix (file kind x choice x lockfile
  transition x resulting bytes).
- Extractor units: clean additions, edits inside manual-adjacent text,
  interleaved-edit refusal.
- Cancel/atomicity tests (write-path sentinel reused from 27/001
  harness).
- Frozen-surface goldens; 27/001 parity extension.
- Wizard/prompt flow via injected prompts and streams (phase-26
  presenter conventions).

## TDD Strategy

RED: the classification matrix and extractor units fail before the flow
exists; frozen-surface goldens stay green throughout. GREEN: extractor +
transitions (I4 first slice), then the interactive flow wiring.

## Documentation Updates

- README compile section (drift resolution); CHANGELOG; phase-27 README.
- `--force` documentation gains "prefer the interactive classification".

## Issue Plan

- I4: drift classification flow - extractor, lockfile transitions,
  interactive compile wiring, parity extension. `human-gate` (spec
  approval); implementation `parallel-safe` with 002's I2/I3 apart from
  shared `apps/cli/src/index.ts` touchpoints (coordinate merges).

## Final Review Checklist

- Spec-to-test matrix over acceptance criteria 1-7.
- Extractor refusal path proven by fixture, not review.
- Write-path sentinel green for every cancel branch.
- Non-interactive compile byte-identity proven by golden.
- ADR 0011 accepted alongside this spec.
