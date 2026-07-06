# `disable-model-invocation` Support (Phase 24, I1)

## Status

Verified against official product documentation on 2026-07-05. This note is the
pinned capability evidence for the Phase 24 skill-invocation policy
(`docs/specs/phase-24/001-workflow-upgrade-skills.md`, decisions D9/D10). It is
evidence for the generated frontmatter flag; it is not permission to generate a
capability by itself.

Confidence values follow `docs/research/008-current-agent-capabilities-2026-07.md`:
`confirmed-official`, `partial-official`, `unknown`, `not-supported`.

## Question

Does a target's `SKILL.md` YAML frontmatter support a field that prevents the
model from automatically invoking the skill, so entry-point skills
(`grill-change`, `request-to-spec-issues`, the WS6 loop skills, and later
`implement-next`) stop consuming model-invocation context?

## Evidence

| Target                  | Field                       | Verdict             | Source |
| ----------------------- | --------------------------- | ------------------- | ------ |
| Claude (`claude-workflow-skills`) | `disable-model-invocation: true` in `SKILL.md` frontmatter | `confirmed-official` | [Claude skills](https://code.claude.com/docs/en/skills) — documented frontmatter field: "Set to `true` to prevent Claude from automatically loading this skill. Use for workflows you want to trigger manually with `/name`." |
| Codex (`codex-workflow-skills`) | none in `SKILL.md` frontmatter | `not-supported` (for this target) | [Codex skills](https://developers.openai.com/codex/skills) — `SKILL.md` frontmatter supports only `name` and `description`. The auto-invocation control (`allow_implicit_invocation`) lives in the separate `agents/openai.yaml`, which is out of scope for the workflow-skills target. |

## Decision (pinned)

- Emit `disable-model-invocation: true` for entry-point skills only on
  `claude-workflow-skills`.
- Omit the flag for `codex-workflow-skills`; the skill is still emitted (this is
  the required flag-omitted variant). Codex's `allow_implicit_invocation` in
  `agents/openai.yaml` is deliberately not generated — that file is excluded by
  `docs/specs/phase-03/004-codex-workflow-skills-target.md`.
- Guardrail skills (`sdd-change`, `tdd-change`, `final-review`,
  `subagent-driven-change`) never carry the flag on any target.

The closed policy table lives in
`packages/compiler/src/skill-selection.ts`
(`MODEL_INVOCATION_ENTRY_POINTS`, `DISABLE_MODEL_INVOCATION_TARGETS`,
`disablesModelInvocation`). Adding a target to the support set requires updating
this note with fresh official evidence — never guess.

## `implement-next` Subagent-Chain Gate (Phase 24, I4)

The `implement-next` dispatcher runs `subagent-driven-change`
(implementer → spec-reviewer → code-quality-reviewer), so it is emitted only for
a target whose subagent chain is `confirmed-official`.

| Target  | Subagent chain | Verdict | Source |
| ------- | -------------- | ------- | ------ |
| Codex   | project custom agents | `confirmed-official` | [Codex subagents](https://developers.openai.com/codex/subagents) (matrix row in `008-current-agent-capabilities-2026-07.md`) |
| Claude  | project/user/plugin subagents | `confirmed-official` | [Claude subagents](https://code.claude.com/docs/en/sub-agents) |
| Tabnine | IDE subagents announced, project-local format unverified | `partial-official` (missing-capability for this dispatcher) | matrix row in `008-current-agent-capabilities-2026-07.md` |

Both workflow-skill targets (Codex and Claude) qualify, so `implement-next` is
emitted for both when `sdd` and `subagentDrivenDevelopment` are enabled. Tabnine
is a missing-capability target and receives an informational compile note
(`implement_next_target_not_generated`) rather than silent omission, mirroring
the WS6 automation-pack note.
