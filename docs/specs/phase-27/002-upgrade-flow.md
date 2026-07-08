# Spec: Existing-Profile Upgrade Flow

## Status

Approved 2026-07-08. Synthesized from the grill-change agreement record
of the same date (five decisions, one derived decision). Accepts ADRs
0009 and 0010.

Amended 2026-07-08 (I2 implementation): `upgrade.catalogVersion` is a
monotonic integer catalog revision (the phase number that introduced a
capability, e.g. `25`), not a product semver. The grill used `"0.4.1"`
illustratively; the integer revision decouples the catalog from the
release version and is the binding encoding.

## Problem

`init` detects an existing profile and, per its approved contract, leaves
capabilities unchanged. Every capability added after a profile was created
(phase-24 skills, phase-25 logging guidance, subagent packs) is
unreachable except by hand-editing `ai-profile.yaml`, and nothing tells
the user those additions exist.

## Goal

A new `agent-profile upgrade` command that shows which capabilities are
available but not enabled, lets the user keep, adopt, or customize, and
applies accepted additions as comment-preserving insertions into
`ai-profile.yaml` - through the normal diff -> approve -> atomic write
path.

## Intent

Capabilities become reachable without hand-editing YAML, while
`ai-profile.yaml` remains user-owned intent: upgrade inserts, never
rewrites, never removes, never modifies existing values.

## Decision Rules

1. Ownership doubt -> the profile is the user's; refuse rather than
   guess.
2. Detection doubt -> profile content is truth for "enabled"; catalog
   delta is truth for "new".
3. Mutation doubt -> insertion-only; anything else stays a manual edit.
4. Posture doubt -> the most conservative command in the CLI.

## Non-Goals

- Modifying existing profile values: `safety.mode`, setup profile,
  client enable/disable, languages/stack fields, MCP config.
- Removing capabilities.
- Per-pack decline memory (ADR 0010).
- Re-rendering any part of the profile (ADR 0009).
- Changes to init's existing-profile contract (phase-12/007 stands).
- Drift reconciliation (003) and the no-args dispatcher (004).

## User Flow

1. `agent-profile upgrade` on a repo with an existing profile.
2. Interactive TTY: logo/intro (phase-26 conventions), then a summary of
   offered capabilities (available in the installed APC, newer than the
   lockfile's `upgrade.catalogVersion`, and not enabled in the profile).
3. Three-way select: `Keep current` (first, default) / `Adopt
   recommended` / `Customize` (multiselect over the offered set).
4. Diff preview of the exact profile insertions; write confirmation with
   preview-only as the default.
5. On write: targeted insertions into `ai-profile.yaml`, lockfile
   `upgrade.catalogVersion` stamped to the installed catalog version,
   pointer line to `agent-profile compile` (upgrade does not chain
   compile).
6. Non-interactive (CI, no TTY, `--non-interactive`): report-only - print
   the offered set, write nothing, exit 0. The only scripted mutation
   path is the explicit pair `--write --adopt-recommended`.
7. `init` on an existing profile prints a one-line pointer to upgrade on
   the interactive TTY only; non-interactive init stays byte-identical.

## Inputs

`ai-profile.yaml` (source of truth for enabled capabilities),
`ai-profile.lock` (`upgrade.catalogVersion`; a missing field means "offer
everything not enabled" - the seeding rule for pre-existing lockfiles),
the static capability catalog.

## Outputs

Inserted profile entries (new pack list items, new workflow booleans),
updated `upgrade.catalogVersion`, upgrade report text. No generated
client artifacts (that remains compile's job).

## Contracts (binding)

- The capability catalog is a reviewed source table in `@agent-profile/core`
  mapping capability id -> `introducedIn` (integer catalog revision) ->
  profile insertion shape. `CAPABILITY_CATALOG_VERSION` is the current
  revision. Extending it is a source change reviewed like the assist
  vocabularies, and becomes a release-checklist item for every
  capability-adding phase.
- `upgrade.catalogVersion` is an additive lockfile field holding a
  monotonic integer catalog revision (>= 1); lockfiles without it remain
  valid (seeding rule above), and lockfile v1 forbids the field. The
  offered set is catalog entries whose `introducedIn` exceeds the
  recorded revision and are not enabled; a missing revision offers every
  not-enabled capability. No other schema change.
- Profile edits are insertion-only, applied via the `yaml` Document API
  preserving all user comments, ordering, and formatting outside the
  inserted lines. When the document shape defeats safe insertion
  (unparseable structure, flow-style target sequences, anchors on the
  target node), upgrade refuses that insertion and prints the exact
  manual line to add - it never falls back to re-rendering (ADR 0009).
- `Keep current` is the interactive default; preview-only is the write
  default; non-interactive is report-only with exit 0 and never mutates
  without `--write --adopt-recommended`.
- init behavior is unchanged except the interactive-TTY-only pointer
  line; all frozen init surfaces stay byte-identical.
- All writes route through diff -> approve -> single atomic write.

## Security Rules

- Upgrade never touches `safety.mode` or the permission table; posture
  changes are out of scope by contract, so the command cannot weaken
  guarantees.
- No network, no new dependencies, no secrets read; no telemetry.
- Refusal paths print instructions, never partial writes.

## Acceptance Criteria

1. Profile with old `catalogVersion` -> offered set = catalog entries
   newer than it and not enabled; profile already current -> "nothing to
   offer" and no prompts beyond the report.
2. Missing `catalogVersion` (pre-existing lockfile) -> offered set =
   everything not enabled; after any upgrade run (including keep-current
   with write declined? no - only on write) the field is stamped only
   when a write occurs.
3. Adopt/customize -> the diff shows only inserted lines; every user
   comment and formatting byte outside them is preserved
   (byte-comparison test on a commented fixture profile).
4. Refusal fixture (flow-style pack sequence) -> no write, exact manual
   line printed, exit reports the refusal without failing the run.
5. Non-interactive -> report-only, exit 0, no writes; `--write
   --adopt-recommended` -> insertions applied without prompts.
6. Insertion-only sentinel: no existing YAML node's value is ever
   modified or removed in any flow (fixture with every mutable field
   asserts byte-equality outside insertions).
7. Interactive init on an existing profile prints the pointer line;
   non-interactive init byte-identical to baseline.

## Tests

- Catalog unit tests (shape, version ordering, insertion templates).
- Offered-set computation matrix: catalogVersion present/missing x
  enabled/not-enabled.
- Comment-preservation byte tests on commented/odd-format fixtures;
  refusal-path fixtures.
- CLI flow tests via injected prompts (keep/adopt/customize/cancel);
  non-interactive report and scripted-mutation tests.
- Init pointer-line test (interactive) + frozen-surface goldens.

## TDD Strategy

RED: offered-set matrix, insertion byte tests, and the insertion-only
sentinel fail before the catalog and editor exist. GREEN: catalog +
lockfile field (I2), then command + wizard + editor (I3).

## Documentation Updates

- README command section; CHANGELOG; phase-27 README.
- Release checklist: bump the capability catalog on capability-adding
  phases.

## Issue Plan

- I2: capability catalog + `upgrade.catalogVersion` lockfile field +
  offered-set computation. `human-gate` (spec approval).
- I3: `upgrade` command - wizard flow, insertion editor with refusal
  path, non-interactive report, init pointer line. `sequenced` after I2.

## Final Review Checklist

- Spec-to-test matrix over acceptance criteria 1-7.
- Insertion-only sentinel and comment-preservation byte tests present.
- Frozen init surfaces proven byte-identical.
- Catalog recorded as reviewed source with a release-checklist note.
- ADRs 0009/0010 accepted alongside this spec.
