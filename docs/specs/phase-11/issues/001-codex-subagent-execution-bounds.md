# I1: Codex subagent execution bounds (`maxTurns`, `timeoutMinutes`)

## Parent spec or request

`docs/specs/phase-11/003-codex-subagents-target.md`, against the input list in
`docs/specs/phase-11/001-subagents-schema.md`.

Raised 2026-07-31 from the phase-33 change-risk reviewer work, not from a
grill: the `maxTurns` cap added to the change-risk reviewer turned out to
reach Claude only, and the gap is general to the Codex target rather than
specific to that agent.

## Intent summary

A bound the profile declares must either reach the target or be reported as
unsupported. Silently dropping it means an operator who caps an agent believes
it is capped when it is not.

## Behavior slice

`001-subagents-schema.md` lists `maxTurns` and `timeoutMinutes` among the
target-neutral compilation inputs that `002`, `003`, and `004` consume.
`002` maps `maxTurns` to Claude frontmatter and `004` maps it to Tabnine
`max_turns`. `003`'s profile-to-Codex mapping table has no row for either
field and its Non-Goals do not mention them, so both are accepted by schema
validation and then dropped with no output and no note.

Verify against current official Codex subagent documentation whether a
per-agent turn or wall-clock bound exists, then take exactly one branch:

- If Codex supports it: add the mapping rows to `003`, emit the keys in
  `renderCodexSubagent` in the target's stable key order, and pin them in the
  Codex subagent goldens.
- If Codex does not support it: state that in `003`'s Non-Goals and emit the
  existing not-generated/unsupported note so the operator learns the declared
  bound does not apply to this target, rather than inferring it does.

Do not invent a Codex key name. `001` already forbids raw target keys in the
profile, so the mapping belongs in the target spec and generator only.

## Non-goals

- Changing the canonical schema, its validation, or any other target's mapping.
- Adding a bound Codex does not document, or emulating one in the prompt text.
- Revisiting the change-risk reviewer's own budget, which phase-33 owns.
- Doctor checks for subagent bounds, owned by `005-doctor-subagent-checks.md`.

## Acceptance criteria

- `003`'s mapping table accounts for `maxTurns` and `timeoutMinutes`, either
  with an output row or an explicit unsupported statement citing the verified
  Codex documentation.
- When supported: a profile declaring both fields emits them for Codex, and a
  profile omitting them emits neither; the Codex output contract's stable key
  order and byte rules still hold.
- When unsupported: compiling a profile that declares either field for an
  enabled Codex client produces the informational not-generated note exactly
  once, and never a silent drop.
- Claude and Tabnine subagent bytes are unchanged either way.
- The verification date and the documentation consulted are recorded, matching
  `001`'s existing rule that official target docs are verified before mapping.

## Expected RED proof

A Codex subagent golden or emission test asserting the declared bound is
represented (or that the unsupported note is emitted) fails against current
output, which contains neither.

## Expected GREEN proof

The Codex goldens carry the bound or the run carries the note; the Claude and
Tabnine subagent goldens are byte-identical to before.

## Seam under test

`AiProfileSubagent` execution bounds -> `renderCodexSubagent` output, plus the
compile note surface when the branch is "unsupported".

## Allowed mock boundary

None. Render real subagents through the real generator; do not mock the
renderer or the note surface.

## Test command guidance

Run the compiler subagent emission tests and the Codex subagent goldens before
the broader compiler suite.

## Likely file ownership

- `docs/specs/phase-11/003-codex-subagents-target.md`
- `packages/compiler/src/compiler.ts` (`renderCodexSubagent`, compile notes)
- Codex subagent fixtures and their tests

## Dependencies

None. Independent of phase-33; `parallel-safe` with it.

## Parallelism notes

Touches the Codex subagent renderer and its goldens only. Coordinate with any
concurrent work on the same fixtures.

## Contract impact

Either widens the Codex per-agent output contract by two keys, or narrows the
declared input list for one target with an explicit, discoverable statement.
No canonical schema change either way.

## Security impact

None directly. An unenforced execution bound is a resource and
runaway-behaviour concern rather than a confidentiality one, but an operator
believing a cap is active when it is not is the failure this closes.

## Documentation impact

`003`'s mapping table, and its Non-Goals when the unsupported branch is taken.

## Review expectations

Confirm the branch taken is justified by cited current Codex documentation and
not by convenience. Check that an unsupported note fires exactly once per
compile rather than per agent, that it does not change the exit code, and that
no Codex key name was invented. Confirm the Claude and Tabnine mappings were
not touched to make the Codex branch easier.
