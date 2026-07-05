# Spec: Workflow Upgrade - Ledger, Glossary, Seam Protocol, Skill Invocation Policy

## Status

Approved on 2026-07-05. Synthesized from the grill-change agreement record of
the same date (decisions D1-D10).

## Problem

The grill -> synthesis -> implementation pipeline loses state between phases:
issue briefs end in chat, durable terms die in the agreement record, the test
seam is chosen silently inside the TDD loop, and "implement the next task"
requires manually reassembling context. Generated skills also expose every
skill to model invocation, spending context tokens on entry points only
humans should trigger.

## Goal

Generated skills instruct agents to persist workflow state (task ledger,
issue briefs, glossary, ADRs), decide seams and mock boundaries at synthesis
time with a human gate, enforce them during TDD with an escape hatch, and
expose a single `implement-next` command per task. Entry-point skills carry
`disable-model-invocation: true` where the target verifiably supports it.

## Intent

After grill plus one synthesis approval, the human only repeats one command
per task; the agent receives a hard, persisted brief (seam, mock boundary,
glossary) instead of vague context. Architecture decisions move before TDD
where the human already approves the plan; the TDD loop runs without new
interactions.

## Decision Rules

1. Artifact ownership doubt -> agent writes, APC instructs, human approves (D1).
2. Seam doubt -> higher and fewer seams, while tests stay fast and
   deterministic (D6).
3. Autonomy doubt -> stop and report, never continue silently (D3, D7).
4. Target capability doubt -> capability matrix `confirmed-official`, else
   not-supported note (D9).
5. Reuse existing mechanisms (dependency rule, diff flow, statuses) before
   inventing new ones (D5, D8).

## Non-Goals

- Playwright or e2e acceptance layer (separate future change).
- WS5 slice 2 command-runner hooks (stays behind its threat-model gate in
  `phase-later/001`).
- Plugin / claude-plugin compile target.
- Multi-task autonomous iteration (`implement-next` never iterates; WS6 loop
  skills unchanged).
- GitHub issue creation (ledger is local).
- Tabnine workflow artifacts (informational note only).
- Any new `ai-profile.yaml` schema key.

## User Flow

1. Human runs `grill-change`; hard-to-reverse choices arrive as
   Design-it-Twice questions; durable terms and ADR candidates land in the
   agreement record.
2. Human runs `request-to-spec-issues`; synthesis produces a spec candidate
   plus briefs with `Seam under test` / `Allowed mock boundary`, and in one
   approved write step creates or updates `TASKS.md`,
   `docs/specs/<spec-dir>/issues/NNN-slug.md`, `CONTEXT.md`, and ADRs meeting
   the threshold.
3. Human repeats `implement-next`: first `ready` task -> `in-progress` ->
   `subagent-driven-change` with the brief as Fresh Context -> reviews plus
   tests -> `done` -> stop. Failures mark the task `blocked` with a one-line
   reason and stop.

## Inputs

`ai-profile.yaml` (existing keys only), existing pack/skill selection, the
capability matrix, and the agreement record at runtime.

## Outputs

Updated generated skill bodies (`grill-change`, `request-to-spec-issues`,
`tdd-change`, plus `subagent-driven-change` pointer updates as needed), new
generated skill `implement-next`, per-skill `disable-model-invocation`
frontmatter per the policy table, updated golden fixtures, and optional
informational doctor notes for `TASKS.md` / `CONTEXT.md` structure.

## Contracts

- APC never generates, lockfile-tracks, or executes against `TASKS.md`,
  `CONTEXT.md`, or ADRs (D1). No execution path is added.
- Determinism: same profile -> byte-identical output; content changes land
  only through this spec's fixture updates (D8).
- Ledger states are a closed set:
  `ready | blocked | sequenced | parallel-safe | human-gate | in-progress | done` (D2).
- Brief format = the existing 15 fields plus `Seam under test` and
  `Allowed mock boundary` (D2).
- `implement-next` is emitted iff `request-to-spec-issues` and
  `subagent-driven-change` are emitted for that target and the subagent chain
  is `confirmed-official` (D8, D9); the phase-12/003 conditional-pointer rule
  applies, with no dangling references in any pack combination.
- Flag policy is a closed table: entry points (`grill-change`,
  `request-to-spec-issues`, `implement-next`, WS6 loop skills) get
  `disable-model-invocation: true`; guardrails (`tdd-change`, `sdd-change`,
  `final-review`, `subagent-driven-change`) never (D10). The flag is emitted
  only for targets with verified support (D9).
- `tdd-change` keeps RED-for-the-right-reason, the golden-fixture rule, and
  red -> green -> refactor unchanged (D5).

## Security Rules

- No secrets in generated content.
- No GitHub issue creation.
- No autonomous multi-task iteration; `implement-next` never edits briefs or
  continues past a failure.
- The grill remains read-only.
- All writes go through the client's write-approval flow.

## Acceptance Criteria

1. A baseline profile (no relevant packs) produces byte-identical output
   except for skills updated by this spec.
2. Emitted `grill-change` contains the Design-it-Twice protocol; emitted
   `request-to-spec-issues` contains the Seam & Interface Design section
   (classification, highest-fast-deterministic seam rule, mock-boundary
   declaration, sizing rule, 5-question checklist), ledger/brief write
   instructions, and glossary/ADR write instructions with the three-criteria
   threshold.
3. Emitted `tdd-change` contains the tautological-test anti-pattern,
   boundary-only mocking (unmanaged dependencies only, fake > stub >
   mock/spy, no test-only abstractions), a glossary-read instruction, and
   seam enforcement with an escape hatch (`BLOCKED` with reason, never a
   silent redesign).
4. `implement-next` is emitted per the dependency rule with D3/D7 semantics;
   a missing-capability target gets an informational note, never silence.
5. Frontmatter flags match the policy table per target; unverified target
   support means the flag is omitted.
6. All goldens are updated within this spec; doctor performs no error-level
   checks on runtime artifacts.

## Tests

- Golden fixtures per target for every changed or new skill body and
  frontmatter (including a flag-omitted variant for any unverified target).
- Unit tests in `skill-selection.test.ts` for the `implement-next` emission
  rule across pack combinations (no dangling reference).
- A table-driven test for the flag policy table (entry point vs guardrail x
  target support).
- A structural doctor test: informational (not error) result for a malformed
  `TASKS.md` / `CONTEXT.md`; absence tolerated silently.
- Execution sentinel: no new execution path in the compiler.

## TDD Strategy

Slice classification: deterministic generator. Seam under test:
`compile(profile) -> emitted artifacts` observed via golden fixtures, plus
the `skill-selection` pure functions for emission rules (output-based, no
mocks). Allowed mock boundary: none (pure functions plus fixture
comparison). One slice = one observable emission change = one focused RED.

## Issue Plan

See `docs/specs/phase-24/issues/` (I1-I5) and the root `TASKS.md` ledger.

## Documentation Updates

- Phase-24 README.
- Capability matrix research note for `disable-model-invocation` support and
  Codex subagent support.
- Generated docs references if skill lists are enumerated there.

## Final Review Checklist

- Spec-to-test matrix for every MUST above.
- Golden diffs reviewed against decisions D1-D10.
- Execution sentinel confirmed.
- Conditional-pointer sweep across pack combinations.
- Flag table verified per target evidence.
