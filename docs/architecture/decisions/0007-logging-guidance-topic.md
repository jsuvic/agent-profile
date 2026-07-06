# ADR 0007: Logging Guidance As A Guidance Topic, Not A Skill

## Status

Accepted with phase-25 approval (2026-07-06)

## Context

Phase 25 adds a stack-agnostic logging convention that APC emits into
consuming projects. Two delivery surfaces were considered: a generated
guidance topic (`workflow.loggingGuidance`, following the phase-10/23
pattern of `workflow.codeReview` and `workflow.memoryGuidance`) or a
dedicated generated skill (`logging-practices`) in a skills pack.

## Decision

Deliver the logging convention as a guidance topic: an AGENTS.md section
(inherited by CLAUDE.md) plus a Tabnine guideline, gated by the additive
`workflow.loggingGuidance` boolean. Enforcement lives as flag-conditional
lines in the `implementer`, `code-quality-reviewer`, and `final-review`
templates, never inside `tdd-change`.

## Rationale

A logging discipline is an always-on convention, not an on-demand playbook.
Skills reach only skill-capable clients (Claude, Codex) and apply only when
invoked - exactly the failure mode the convention is meant to prevent.
Guidance topics are read on every pass, reach Tabnine, and reuse existing
gating, rendering, and golden-fixture machinery.

## Consequences

Positive:

- The convention reaches every enabled client, including Tabnine.
- No new emission mechanism; the phase-23 pattern is reused verbatim.

Negative:

- The schema gains one more `workflow.*` boolean, which is hard to move or
  rename after release.
- Tabnine gets the documentation without the prompt/review enforcement
  layer (documentation-only asymmetry).
