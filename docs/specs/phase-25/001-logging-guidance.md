# Spec: Logging Guidance Topic for Consuming Projects

## Status

Approved on 2026-07-06. Synthesized from the grill-change agreement record of
the same date (decisions L1-L4).

## Problem

Agents in consuming projects log ad hoc: temporary debug prints survive task
completion, error paths ship without stable identifiers, values that must
never be logged leak into logs, and support has nothing to grep. APC
generates no logging convention and no enforcement of one.

## Goal

A single additive flag (`workflow.loggingGuidance`) emits an always-read,
stack-agnostic logging convention (AGENTS.md section inherited by CLAUDE.md,
Tabnine guideline) plus conditional enforcement lines in the `implementer`
prompt, `code-quality-reviewer`, and `final-review` templates.
Document-and-instruction only; APC generates no application code.

## Intent

Debug output stays temporary, observability logs stay permanent and coded,
redaction is non-negotiable - enforced at the layers agents read on every
pass (prompt, review), never inside the TDD loop.

## Decision Rules

1. Content doubt -> principle, not tool; nothing that rots with a stack (L2).
2. Enforcement doubt -> instruction in prompt/review layer, never execution
   (L3).
3. Placement doubt -> always-read layer (AGENTS.md, prompts) before invocable
   layer (skills) (L1).
4. Priority conflicts in the emitted text: redaction > project convention >
   event codes (explicit ordering).
5. Reuse existing mechanisms: guidance-topic pattern, conditional-pointer
   rule, ADR threshold, implementer statuses.

## Non-Goals

- APC-internal logger (CLI/web of this repo) - separate future spec.
- Generating logger code/scaffolding into consuming projects.
- Recommending specific libraries per stack.
- Telemetry/transport guidance (log shipping, aggregators, APM).
- Deterministic lint/hook enforcement (WS5 slice 2 territory).
- Changes to `spec-reviewer` or `tdd-change` (binding: unchanged).

## User Flow

1. User sets `workflow.loggingGuidance: true` (or checks the wizard
   checkbox).
2. Compile emits the guidance topic (AGENTS.md section + Tabnine guideline)
   and the conditional enforcement lines in `implementer`,
   `code-quality-reviewer`, and `final-review` for targets where those
   artifacts are emitted.
3. Diff -> approve -> atomic write; artifacts are lockfile-tracked; doctor
   treats them like any other generated documentation.

## Inputs

`ai-profile.yaml` with the new optional boolean; existing target/pack
selection.

## Outputs

Guidance topic renderings (AGENTS.md section, Tabnine guideline), updated
`implementer` / `code-quality-reviewer` / `final-review` bodies (conditional
lines), wizard checkbox, updated golden fixtures.

## Contracts

- `workflow.loggingGuidance`: optional boolean, additive, default absent/off;
  `additionalProperties: false` preserved. Flag off -> byte-identical
  baseline.
- Content contract (binding, six elements, L2):
  1. Debug/observability split with removal-before-done; prefer a narrower
     failing test over debug prints.
  2. Project convention precedence, with an ADR-candidate proposal when no
     convention exists - never ad hoc invention.
  3. Stable event codes on new error paths, not free text.
  4. The verbatim redaction rule, exactly this text:

     > Never log secrets, tokens, credentials, environment variable values,
     > user file contents, or personal or production data. Log by allowlist:
     > only values explicitly known to be safe.

     The verbatim rule text is fixed by this approval; changing it is a spec
     change.
  5. Channel separation: diagnostics never contaminate machine/product
     output (stderr vs stdout or the platform equivalent).
  6. Support-relied logs are observable behavior and deserve tests;
     incidental debug logs are never asserted.
- The emitted text states the priority order explicitly: redaction >
  convention > codes.
- Enforcement lines are emitted only when the flag is on and the referencing
  artifact is emitted for that target (phase-12/003 conditional-pointer
  rule; no dangling references in any combination).
- `implementer`: leftover debug output before `DONE` -> report
  `DONE_WITH_CONCERNS`.
- Deterministic, lockfile-tracked, byte-stable output; no new execution
  path.

## Security Rules

- The verbatim redaction rule appears in every rendering of the topic.
- No telemetry, transport, or log-shipping instructions in any emitted text.
- No secrets in generated content; guidance never instructs logging of
  values outside the allowlist.

## Acceptance Criteria

1. Flag off -> byte-identical baseline output.
2. Flag on -> AGENTS.md section + Tabnine guideline containing all six
   content elements, the verbatim redaction rule, and the explicit priority
   order.
3. Flag on -> enforcement lines present in `implementer`,
   `code-quality-reviewer`, and `final-review` exactly where those artifacts
   are emitted; absent otherwise; no dangling reference in any pack/target
   combination.
4. `spec-reviewer` and `tdd-change` outputs are byte-identical to pre-change
   fixtures.
5. The wizard offers the checkbox; the schema validates the boolean; unknown
   values are rejected.
6. Doctor requires no new check types (artifacts are ordinary generated
   docs).

## Tests

- Golden fixtures: flag-on and flag-off variants per target for the topic
  and all three enforcement surfaces.
- Schema unit tests: boolean accepted, junk rejected,
  `additionalProperties` preserved.
- Verbatim-rule assertion: the exact string present in every rendering
  (mirrors the phase-23 secret-rule test).
- Conditional-pointer sweep test across pack/target combinations.
- Byte-identity regression for `spec-reviewer` / `tdd-change`.

## TDD Strategy

All slices classify as deterministic generator. Seam under test:
`compile(profile) -> emitted artifacts` via golden fixtures plus
schema-validation pure functions. Allowed mock boundary: none. One slice =
one observable emission change = one focused RED. Human-gate checklist
confirmed: highest deterministic boundary, black box, explicit interface,
glossary names (`guidance topic`, `event code`, `redaction rule`), no
test-only abstractions.

## Issue Plan

See `docs/specs/phase-25/issues/` (I1-I3) and the root `TASKS.md` ledger.

## Documentation Updates

- Phase-25 README.
- ADR 0007 (logging guidance as a guidance topic, not a skill) and ADR 0008
  (verbatim redaction rule as fixed text).
- `CONTEXT.md` seed (first durable terms).
- `TASKS.md` ledger extension.

## Final Review Checklist

- Spec-to-test matrix for every MUST above.
- Verbatim redaction rule byte-compared in every rendering.
- Conditional-pointer sweep across pack/target combinations.
- Byte-identity of untouched surfaces (`spec-reviewer`, `tdd-change`).
- No execution path added.
