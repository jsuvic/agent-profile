# ADR 0013: Tabnine Layered Emission Via The Shared Skills Convention

## Status

Accepted 2026-07-10 with phase-29/001 spec approval. This does not
supersede ADR 0007: that ADR decided logging guidance ships as an
always-read topic, a decision unaffected here. ADR 0007 receives only a
dated note that one rationale premise ("skills reach only Claude/Codex")
is outdated.

## Context

Before phase-29, APC emitted workflow skills only for Claude and Codex
because Tabnine had no documented mechanism to invoke instruction
content - the premise recorded (for logging) in ADR 0007. Tabnine CLI
now ships Agent Skills that discover
`<project>/.agents/skills/<name>/SKILL.md` - the exact path and
frontmatter format APC already emits for Codex - and Subagents in a
proprietary `.tabnine/agent/agents/` path gated behind an experimental
settings flag. A field test (0.4.1, 2026-07-10) showed users selecting
capability packs on Tabnine-only setups and expecting the workflow
skills.

## Decision

Tabnine emission is layered. Guidelines remain the always-read layer for
conventions and guidance topics. Invocable workflow procedures are
emitted once, to the shared `.agents/skills/` convention, and are
discovered by every convention-speaking client (Codex and Tabnine today);
no Tabnine-specific copy is ever generated, and no procedure is mirrored
into a guideline. Delegation-dependent skills are emitted only when a
delegation-capable client (Claude/Codex) is enabled; Tabnine-only setups
get an informational compile note instead. Tabnine subagents are excluded
while the feature requires `"experimental": { "enableAgents": true }` -
APC does not write user settings and does not build on contracts the
vendor labels unstable; revisit when the flag drops.

## Rationale

One skill file per procedure keeps generated output deterministic and
gives the lockfile a single ownership entry - a Tabnine-specific copy
would double the artifact surface and create a byte-drift failure class
between copies, exactly what phase-27 spent three specs hardening
against. The layering mirrors the phase-25 placement rule (always-read
conventions vs invocable procedures) and the one-source-of-truth pattern
(ADR 0008): duplicating a workflow across layers invites paraphrase
drift. Alternatives considered: `.tabnine/agent/skills/` copies
(rejected: duplication and drift); emitting subagents now (rejected:
experimental gate, settings write, unverified delegation semantics).

## Consequences

Positive:

- Tabnine-only users get real, invocable workflow skills with zero new
  content and zero duplication; Codex+Tabnine repos need no new files at
  all.
- The shared convention makes future convention-speaking clients free.

Negative:

- `.agents/skills/` is now a multi-vendor surface; content must stay
  client-neutral or conditionally rendered (the conditional-pointer rule
  carries this).
- Tabnine-only setups lack the delegation workflows until Tabnine
  subagents stabilize (documented via compile note).
- A Tabnine CLI generation caveat enters the generated notes.
