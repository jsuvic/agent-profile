# Phase 10 Spec Map

## Status

Approved. Phase 10 is cross-target guidance expansion.

## Purpose

Phase 10 extends three verified guidance targets with four conditional topic
blocks: React stack, code review, refactoring, and documentation. The phase
is intentionally narrow: it adds guidance content already representable by
`ai-profile.yaml` without modifying the profile schema beyond small additive
optional booleans, and without changing the lockfile contract or any
unrelated target.

The phase exists because teams adopting `agent-profile` need React stack
coverage and dedicated review, refactor, and documentation guidance that the
verified phase-02 Tabnine output and the verified phase-01/004 `AGENTS.md`
output do not yet emit. Originally scoped to Tabnine only, the phase is
reshaped here so the same content lands across every guidance surface a
project may enable, because the underlying gap is target-neutral.

## Target Surfaces

Each topic block lands on the surface(s) appropriate to each verified target:

- `.tabnine/guidelines/<id>.md` — Tabnine reads only this directory. Each
  topic emits one segmented file when its conditional gate is open.
- `AGENTS.md` — Codex reads this directly; Claude Code reads it via the
  `@AGENTS.md` import declared in `CLAUDE.md`. Each topic emits one
  conditional section at a stable insertion position.
- `CLAUDE.md` — unchanged by phase 10. The verified `phase-03/003` contract
  states that `CLAUDE.md` must not duplicate the `AGENTS.md` body
  (`phase-03/003` line 174). All four topics are target-neutral developer
  guidance, so duplicating them into `CLAUDE.md` would violate that contract
  and bloat Claude context. Claude already receives the guidance via the
  shared `AGENTS.md` import.

If a future topic requires Claude-specific guidance that genuinely differs
from `AGENTS.md`, that topic — not phase 10 — would amend `phase-03/003`
with an explicit Claude-only delta.

## Review Order

1. `001-react-stack-guidance.md`
2. `002-code-review-guidance.md`
3. `003-refactoring-guidance.md`
4. `004-documentation-guidance.md`

The React spec ships first because it closes a stack coverage gap. The three
workflow specs ship together because they share the same conditional-render
pattern, security constraints, and small additive schema fields.

## Implementation Gate

Phase 10 implementation is allowed only when these conditions are true:

- specs `001` through `004` are approved
- the `phase-02/001` Output Contract is amended additively to list the four
  new conditional Tabnine outputs without changing the existing seven
- the `phase-01/004` Content Contract is amended additively to insert the
  four new conditional `AGENTS.md` sections at stable positions without
  reordering the existing nine sections
- the `phase-03/003` contract is **not** modified by phase 10
- new golden fixtures exist for every new conditional Tabnine file and for
  every new conditional `AGENTS.md` section
- the existing `fixtures/minimal-valid/expected/.tabnine/guidelines/` golden
  output is verified unchanged
- the existing `fixtures/minimal-valid/expected/AGENTS.md` golden output is
  verified unchanged (no conditional flag fires for the minimal fixture)
- the existing `fixtures/minimal-valid/expected/CLAUDE.md` golden output is
  verified unchanged

## Verification Gate

Phase 10 verification requires:

- the four new Tabnine template ids appear in the `phase-02/001` Output
  Contract
- the four new `AGENTS.md` conditional sections appear in the
  `phase-01/004` Content Contract with stable insertion positions
- new outputs are emitted only when the corresponding profile flag or stack
  hint is present; absence of the flag must produce no output and no warning
  on every affected target
- new outputs follow the byte-level determinism contract from
  `phase-01/003`
- new Tabnine files carry the generated-file header from `phase-02/001`
- new `AGENTS.md` sections do not break the LF / single-trailing-newline
  contract from `phase-01/004`
- new outputs respect `effectivePermissions` for shell, dependency, network,
  secret, and production access on every affected target
- `CLAUDE.md` is byte-identical across the phase boundary
- no schema, lockfile contract, Codex config, Claude config, or other target
  output changes beyond the additive optional booleans listed in `002`–`004`
- closed-gate profiles do not gain phase-10 template descriptors in
  `ai-profile.lock`

## Out of Scope

- adding new profile schema fields beyond small additive optional booleans
  in `workflow` for review, refactor, and documentation
- changing the lockfile contract
- changing `.codex/config.toml`, `.claude/settings.json`, or `.mcp.json`
- changing `CLAUDE.md` — phase 10 emits no `CLAUDE.md` deltas
- generating Codex or Claude workflow skill files (`phase-03/004`,
  `phase-03/005`)
- MCP server declarations (`phase-later/008`)
- SonarQube or any other MCP worked example (`phase-later/009`)
- changes to Tabnine IDE permission handling (remains unverifiable per
  `phase-02/002` and `phase-04/003`)
- "Tabnine skills" or any prompt-template surface Tabnine does not document
- duplicating `AGENTS.md` content into `CLAUDE.md`

## Cross-Phase Contracts

- `phase-02/001` still owns the Tabnine guidelines target contract; phase 10
  amends its Output Contract additively only.
- `phase-01/004` still owns the `AGENTS.md` target contract; phase 10
  amends its Content Contract additively only, inserting new conditional
  sections at stable positions and leaving the existing nine sections in
  their fixed order.
- `phase-03/003` is unchanged; phase 10 does not emit `CLAUDE.md` deltas.
  The non-duplication invariant in `phase-03/003` is preserved.
- `phase-04` doctor checks apply unchanged; new conditional outputs must not
  break existing drift, secret, or permission checks.
- `phase-later/008` (MCP server declaration schema) is independent and may
  proceed in parallel without blocking or being blocked by phase 10.

## Content Layer

To avoid drift between the Tabnine file and the `AGENTS.md` section for a
given topic, phase 10 implementation should factor each topic's prose into a
single target-neutral content source consumed by both target templates. The
sub-specs declare the topic boundaries; the implementation phase decides the
exact module layout. Tabnine and `AGENTS.md` golden fixtures must remain in
lock-step for the same profile input.
