# ADR 0011: Drift Reconciliation As Compile's Interactive Continuation

## Status

Accepted 2026-07-08 with phase-27/003 spec approval.

## Context

A hash mismatch on a lockfile-owned generated file may be an intentional
user edit, but compile's only responses are refusal or `--force`. The
grill settled where resolution lives and what the mechanisms are.

## Decision

Drift resolution runs inside interactive compile at the point of the
hash-mismatch refusal - no separate reconcile command. Root instruction
files get a four-way classification (shared intent / client-specific /
accidental / cancel-default); all other generated outputs get two-way
(keep as `manual-owned` / restore canonical) plus cancel. "Shared intent"
relocates the user's lines into the `AGENTS.md` manual region (adoption
into mixed ownership; inheritance carries the content to Claude and
Codex; Tabnine gap documented). Free text is never reverse-imported into
`ai-profile.yaml`. When user lines cannot be cleanly isolated from
regenerated canonical bytes, relocation is refused rather than
approximated.

## Rationale

Drift is discovered by compile, and the user's goal at that moment is
"make compile succeed" - a separate command bounces them away exactly
when they are annoyed, while sharing all of compile's machinery anyway.
Reverse-importing prose into the structured profile is either
non-deterministic (AI interpretation) or re-invents manual regions inside
YAML; manual regions are where user content already lives by the
product's core ownership rule. Alternatives considered: separate
`reconcile` command (rejected: no independent intent, surface sprawl);
reverse-import (rejected: determinism, ownership).

## Consequences

Positive:

- Every outcome reuses hardened mechanisms: manual regions, mixed
  adoption, `manual-owned` reclassification (27/001), canonical restore.
- `manual-owned` keep becomes the one-keystroke "this file is mine now"
  escape hatch for single-client users.

Negative:

- Compile's interactive branch gains real decision logic.
- Shared content does not reach Tabnine guidelines (documented gap).
- Interleaved edits force the user back to keep/restore/cancel.
