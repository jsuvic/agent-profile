# I2: Codex and Claude exact model adapters

## Parent spec or request

`docs/specs/phase-31.5/001-model-selection-lifecycle.md`

## Intent summary

Render current exact Codex and Claude model/effort intent for primary workflow
stages and delegated roles while stating honestly which target surface is
configured, advisory, unsupported, or unverified.

## Behavior slice

Given one v3 resolution plan, emit deterministic project-local Codex/Claude
configuration and generated guidance only on verified surfaces. The same
resolution rows appear in generated instructions and preview data. Unverified
Fable/Sonnet/client behavior degrades explicitly instead of being claimed.

## Non-goals

- Live availability probing.
- Global/user configuration.
- Runtime fallback orchestration or credential/provider configuration.

## Acceptance criteria

- Re-verify current exact models, effort values, primary settings, skill
  surfaces, and subagent surfaces from official docs and tested client versions.
- Codex candidate rows include Sol/Terra/Luna with `extra-high -> xhigh` unless
  newer pinned evidence approves another mapping.
- Claude candidate rows include Fable 5, Opus 4.8, Sonnet 5, and Haiku 4.5 with
  evidence-accurate effort/status.
- Primary-default, per-workflow/skill, and per-subagent statuses are separate.
- Ordered alternatives are displayed but never described as runtime fallback
  unless a native reviewed control is emitted.
- Existing unowned client config is preserved/refused through current ownership
  planning; no silent overwrite.

## Expected RED proof

Current goldens still contain mapping-v2 exact names and only subagent guidance;
no test distinguishes configured primary/session behavior from advisory roles.

## Expected GREEN proof

Focused adapter tables and Codex/Claude goldens show exact v3 rows, correct
target effort, per-surface status, ownership behavior, and legacy byte identity.

## Seam under test

`resolution plan -> Codex/Claude artifacts and capability-status rows`.

## Allowed mock boundary

None for generation. Client behavior evidence is fixture input, not a mocked
compiler dependency.

## Test command guidance

Run focused compiler mapping/golden tests and ownership planner tests, then core
and compiler workspace suites, goldens, check, and pack verification.

## Likely file ownership

- compiler model target adapters and guidance renderer
- Codex agent/config and Claude settings/skill/subagent emission
- target templates, fixtures, and goldens
- target documentation and mapping-v3 evidence refresh

## Dependencies

I1.

## Parallelism notes

Parallel-safe with I3 and I4 after I1, except shared compiler exports/goldens.

## Contract impact

Exact generated content changes only for explicitly adopted v3 policy. Mapping
v2 and disabled profiles retain existing bytes.

## Security impact

Project-local writes only; preserve unowned config, escape exact IDs, and never
write provider/auth fields or claim runtime enforcement without evidence.

## Documentation impact

Codex/Claude target capability tables, examples, generated guidance, and CLI/UI
preview wording.

## Implementation context

Public Claude Code docs may lag Fable/Sonnet releases. Pin tested evidence or
mark the relevant surface unverified; do not infer from API availability alone.

## Review expectations

Compare every generated claim with current official evidence and check exact
names, effort fallbacks, alternatives, status, ownership, and byte stability.
