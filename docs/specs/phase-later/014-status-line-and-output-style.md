# Spec: Status Line and Output Style Targets

## Status

Draft for a later phase. Not MVP.

Routed from `docs/research/007-agent-best-practices-review.md`
(Cross-Cutting Surfaces Still Missing — Status line / output style).

## Problem

Claude Code exposes `statusLine` (custom status display) and `outputStyle`
(default agent voice / brevity) settings that materially change how an agent
communicates progress and final answers. Teams that adopt a house style —
terse, no trailing summaries, fragments over sentences, no emoji — currently
have to redocument that style in every CLAUDE.md and rely on the agent to
notice. There is no way to declare the style once and have it ship through
the compiler.

## Goal

Add an optional `presentation` block to `ai-profile.yaml` covering status
line and output style. Generate the matching Claude project settings keys
(via the existing `claude-settings` target) and emit equivalent guidance in
`AGENTS.md` / `CLAUDE.md` for targets that do not expose a structured
output-style setting.

## Non-Goals

- inventing a presentation surface that does not exist in the target
- changing live runtime status-line rendering during compile or doctor
- generating user-level, admin-level, or plugin presentation settings
- generating Codex or Tabnine presentation settings until those clients
  document equivalent surfaces

## User Flow

```yaml
# ai-profile.yaml (illustrative)
presentation:
  statusLine:
    enabled: true
    template: "{{branch}} | {{cwd}} | {{tokens}}/200k"
  outputStyle:
    voice: terse
    rules:
      - lead with the answer, not reasoning
      - skip filler words and trailing summaries
      - prefer fragments over full sentences in explanations
      - never use emoji unless the user asks
```

The compiler extends the `claude-settings` target with the matching keys
verified against current official Claude docs at implementation time. For
clients that lack a structured output-style setting (Codex, Tabnine), the
compiler appends an `## Output Style` section to the generated `AGENTS.md`
listing the rules as plain guidance.

## Inputs

- `presentation` block in `ai-profile.yaml`
- existing `claude-settings` target contract (`phase-03/002`)
- existing `AGENTS.md` target contract (`phase-01/004`)
- current official Claude docs for `statusLine` and `outputStyle` verified
  at implementation time

## Outputs

- additive Claude settings keys in `.claude/settings.json` when supported
- `## Output Style` section appended to generated `AGENTS.md` when the
  `outputStyle` block is enabled
- doctor findings:
  - `LINT-PRESENTATION-001` — status-line template references an undocumented
    placeholder
  - `LINT-PRESENTATION-002` — `outputStyle.rules` is empty when
    `outputStyle.voice` is set
  - `LINT-PRESENTATION-003` — `outputStyle.rules` contains conflicting rules
    (e.g. "use bullet points everywhere" and "no bullets")

## Contracts

- Presentation is opt-in. Profiles without the block produce no presentation
  output and existing behavior is unchanged.
- Claude settings additions remain backward compatible with the existing
  `claude-settings@1` template; the spec must increment the template id to
  `claude-settings@2` or land via a new sub-target id so the lockfile drift
  is intentional.
- Generated AGENTS.md style section is short — one paragraph plus a bulleted
  rule list.
- Removing the `presentation` block removes both the settings keys and the
  AGENTS.md section on next compile.

## Security Rules

- Do not embed secrets, environment values, or production endpoints in any
  status-line template or rule.
- Do not generate status-line templates that execute shell commands.
- Do not write to user-level, admin-level, or plugin settings paths.
- Do not silently override existing `outputStyle` settings; doctor must
  report drift between generated and live settings as "not verifiable".

## Acceptance Criteria

- profiles with a `presentation` block produce deterministic settings
  additions and AGENTS.md sections
- profiles without the block produce no presentation output
- doctor flags each `LINT-PRESENTATION-*` rule
- the lockfile records the template id change
- removing presentation propagates cleanly

## Tests

- golden tests for Claude settings rendering with at least one status-line
  template and one output-style block
- golden test for `## Output Style` AGENTS.md section
- absence test
- doctor lint tests for each `LINT-PRESENTATION-*` rule
- determinism test

## Documentation Updates

- `docs/profile/schema.md` — add `presentation` block
- `docs/specs/phase-03/002-claude-config-target.md` — cross-reference
  additive keys and template id bump
- `docs/specs/phase-01/004-agents-md-target.md` — cross-reference
  `## Output Style` section
- future `docs/targets/claude.md` — document status-line + output-style
  surface

## Final Review Checklist

- official Claude docs verified for `statusLine` and `outputStyle` keys at
  implementation time
- template id bump documented in the lockfile drift section
- AGENTS.md style section remains concise
- no shell execution from status-line templates
- Codex/Tabnine support remains gated on capability matrix verification
