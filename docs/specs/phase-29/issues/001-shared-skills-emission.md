# I1: Shared-convention skill emission for Tabnine

## Parent spec or request

`docs/specs/phase-29/001-tabnine-workflow-skills.md` (accepts ADR 0013)

## Intent summary

Setups with Tabnine enabled emit the instruction-only workflow and loop
skills to the shared `.agents/skills/` convention; nothing existing
changes by a byte.

## Behavior slice

Extend the `.agents/skills/` emission condition from "Codex enabled" to
"Codex or Tabnine enabled". Tabnine-capable renderings include the
instruction-only workflow set (grill-change, sdd-change, tdd-change,
final-review, request-to-spec-issues per selected packs) and the
phase-22 loop skills (existing inlining rules). Delegation-dependent
skills (`subagent-driven-change`, `implement-next`) are emitted only
when Claude or Codex is enabled; Tabnine-only setups get an
informational compile note naming them and the reason (phase-22
`automation_target_not_generated` pattern). Generated Tabnine notes gain
one caveat line (Agent Skills requires a current Tabnine CLI
generation). Add a dated staleness note to ADR 0007 that its "skills
reach only Claude/Codex" rationale premise is outdated (Tabnine added
Agent Skills); do NOT change ADR 0007's status or decision - it is not
superseded (its logging-topic decision stands).

## Non-goals

- Anything under `.tabnine/agent/` (skills copies, subagents, hooks);
  writing Tabnine settings.json; guideline content changes; any change
  to Claude/Codex emission.

## Acceptance criteria

Spec 001 acceptance criteria 1-5.

## Expected RED proof

The tabnine-only golden (skills expected, currently absent) and the
extended conditional-pointer matrix (Tabnine-only column) fail against
current emission; the delegation-exclusion note test fails.

## Expected GREEN proof

Tabnine-only fixtures emit the skills with valid frontmatter; the
codex+tabnine vs codex-only byte-diff on shared files is empty;
Claude/Codex-only baselines byte-identical; the exclusion note appears;
no dangling reference in any pack x client combination.

## Seam under test

Compiler emission (`compile(profile) -> artifacts`) via golden fixtures;
the conditional-pointer matrix; wizard capability availability
computation.

## Allowed mock boundary

None (fixtures only).

## Test command guidance

`npm run test --workspace @agent-profile/compiler` and
`--workspace @agent-profile/cli`; golden suite (new tabnine-only
fixtures; all pre-existing fixtures byte-identical); root `check` +
`lint`; `npm run verify:pack`. Also extend `CAPABILITY_CATALOG` only if
a genuinely new user-selectable capability is introduced (this issue
should NOT need it - emission-condition change, not a new capability).

## Likely file ownership

- `packages/compiler/src/*` (emission conditions, cross-reference
  conditionals, compile note)
- `packages/templates/*` only if a conditional block needs a Tabnine
  branch (prefer condition parameters over new template text)
- `apps/cli/src/wizard.ts` (capability availability for Tabnine-only:
  reviewer subagents stay unavailable; workflow packs become available)
- golden fixtures; `docs/architecture/decisions/0007-*.md` staleness
  note (not the status/decision); docs/targets Tabnine page; CHANGELOG

## Dependencies

`ready` (spec approved 2026-07-10). Sequence after phase-27 I5 merges to
keep golden churn separable; no code overlap otherwise.

## Contract impact

New artifacts only for Tabnine-enabled setups; every pre-existing setup
byte-identical (binding, golden-proven). Lockfile: one entry per skill
file, as today.

## Security impact

Text generation only; no invocation, settings writes, or network. The
verbatim safety rules render identically across clients.

## Documentation impact

ADR 0007 staleness note (premise only, decision unchanged);
docs/targets Tabnine page; CHANGELOG; phase-29 README.

## Implementation context

Tabnine docs (verified 2026-07-10): skills discovery includes
`<project>/.agents/skills/<name>/SKILL.md`, frontmatter `name` +
`description`; subagents are `.tabnine/agent/agents/*.md` behind
`"experimental": { "enableAgents": true }` - excluded by ADR 0013. The
conditional-pointer rule is phase-12/003; the loop-skill inlining rules
are phase-22; the note pattern is `automation_target_not_generated`.

## Review expectations

Byte-identity goldens audited (codex+tabnine shared files vs
codex-only); exclusion note text reviewed; no `.tabnine/agent/` path
anywhere in emission; ADR 0007 staleness note present with its status
and decision unchanged; verbatim rules byte-equal across renderings.
