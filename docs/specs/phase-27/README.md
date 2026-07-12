# Phase 27

Ownership and upgrade lifecycle fixes surfaced by the 0.4.0 release
testing (2026-07-07 findings review): the import report contradicts the
compile write path about lockfile-owned files, existing profiles have no
capability upgrade path, and drifted files have no intent-reconciliation
flow.

## Specs

- `001-import-ownership-lockfile-conformance.md` - approved 2026-07-07,
  0.4.1 patch: enforce the phase-14/001 ownership proof order in the
  import report so `init` and `compile` give the same verdict for the
  same file; close the generated-bytes-into-manual-region duplication
  hazard.

- `002-upgrade-flow.md` - approved 2026-07-08, synthesized from the
  grill agreement record of the same date: `agent-profile upgrade` with a
  catalog-version provenance field, keep/adopt/customize, and
  insertion-only comment-preserving profile edits. Accepts ADRs
  0009/0010.
- `003-drift-reconciliation.md` - approved 2026-07-08, synthesized the
  same way: hash-mismatch classification inside interactive compile -
  four-way for root instruction files (shared intent relocates into the
  AGENTS.md manual region), two-way keep/restore for other generated
  outputs. Accepts ADR 0011.
- `006-flow-guidance-patch.md` - approved 2026-07-10 from the
  0.4.1/0.4.2 field-test findings, shipped in 0.4.3: state-computed
  next-step advice (fixes the upgrade -> "run compile" -> dry-run
  dead-end loop), lockfile-optional upgrade per the seeding rule,
  compile dry-run nothing-written hint, strategy-question skip,
  capability-picker client-applicability hints, post-write report
  labeling.
- `004-no-args-dispatcher.md` - draft 2026-07-11, synthesized from the
  grill agreement record of the same date: bare `agent-profile` on an
  interactive TTY becomes a state-aware router (seven-state priority
  table, detection reuses the commands' own machinery, run-once-exit);
  non-TTY bare output stays byte-identical help with no detection.
  Accepts ADR 0014 on approval.

- `007-dispatcher-follow-up-and-clarity.md` - draft 2026-07-12 from the
  second field test (macOS, 0.4.4): consent-gated dispatcher follow-up
  chain (amends ADR 0014), doctor recommendation summary, upgrade
  option hints + honest "Adopt all available" label, dispatcher menu
  logo fix. Approved 2026-07-12 (ADR 0014 amended).

Planned (grill sessions before drafting):

- `005` (phase-later) - local run-cost stats and curated subagent
  context: document per-client local usage sources (Codex session JSONL,
  Claude Code transcripts), optionally emit a post-run cost-summary
  skill, and extend issue briefs with a curated-context section so
  implementation subagents start with exactly the relevant facts instead
  of rediscovering them (local-only; the no-telemetry default is
  binding).

## Issues

- `issues/001-lockfile-first-classification.md` (I1)
- `issues/002-capability-catalog-provenance.md` (I2)
- `issues/003-upgrade-command.md` (I3)
- `issues/004-drift-reconciliation-flow.md` (I4)

I3 implements the approved upgrade flow: offline report mode, interactive
keep/adopt/customize selection, insertion-only YAML edits with refusal rather
than re-rendering, and integer catalog provenance stamped only after a
successful write. Upgrade does not invoke compile.

I4 implements the approved drift-reconciliation flow: interactive `compile`
classifies each hash-mismatched lockfile-owned file at the point of the refusal
(four-way for root instruction files, two-way keep/restore for other generated
outputs), relocates cleanly-separable user lines into a manual region or refuses
relocation for interleaved edits, and routes every outcome through the existing
region-aware planner and a single atomic write. Non-interactive compile,
`--force`, and exit codes stay byte-identical; classifications map only to the
existing `mixed` / `manual-owned` / rehash transitions. Extends the 27/001
parity fixtures so post-reconciliation `init --import` and `compile` agree.

Task states are tracked in the root `TASKS.md` ledger.

I6 adds the approved no-arguments interactive dispatcher: a read-only router
that offers existing commands based on repository state. Explicit verbs remain
the scripting interface, and non-interactive bare help remains unchanged.

## Decisions

- The import-report fix is a conformance patch, not a design change:
  phase-14/001's proof order already mandates lockfile-first; the
  implementation applied it only to client-config entries.
- Drift on lockfile-owned files is informative in the import report and
  blocking in compile (unchanged); making init block too was rejected as
  scope creep for a patch.
- Amendment 2026-07-07: the I1 spec review proved the original "do not
  touch the planner" prohibition contradicted both the parity contract
  and phase-14/001's manual-owned rule; the minimal manual-owned planner
  branch was authorized rather than excluding the row from parity, which
  would have shipped a known phase-14 violation (perpetual compile
  refusals after preserve-as-manual init).
- Second amendment 2026-07-07: no-entry markerless rows are excluded
  from action-category parity and pinned by an expected-pair table
  instead. The init-offers-adoption / compile-refuses divergence is
  phase-14/001's consent gate working as designed - the opposite call
  from the manual-owned case, where the divergence was a genuine
  conformance bug. Rule of thumb recorded: parity applies where the
  lockfile has spoken; where it has not, adoption consent is the
  designed asymmetry.
