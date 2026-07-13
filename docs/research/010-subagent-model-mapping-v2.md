# Subagent Model Mapping v2 Evidence

Status: release-pinned evidence for Phase 30 I1.
Mapping version: 2.
Verified: 2026-07-13.
Client scope: Codex CLI 0.142.2 and Claude Code 2.1.191.

This record is the evidence companion to the versioned target descriptor in
`packages/core/src/profile.ts` and its compiler resolver in
`packages/compiler/src/subagent-mapping.ts`. It is not a promise that a later
client release exposes the same identifiers or controls. Refresh this record,
the descriptor, tests, and mapping version together.

## Codex

- `gpt-5.2-codex` is the pinned balanced and strongest model. OpenAI documents
  `low`, `medium`, `high`, and `xhigh` reasoning effort for it:
  <https://developers.openai.com/api/docs/models/gpt-5.2-codex>.
- `gpt-5.1-codex-mini` is the pinned efficient model. The mapping retains a
  deterministic fallback from requested `xhigh` to its highest verified
  supported pinned effort, `high`; the fallback is used only for this selected
  model, never as a generic Codex clamp.
- The general Responses API reference documents `xhigh` reasoning effort for
  models after `gpt-5.1-codex-max`:
  <https://platform.openai.com/docs/api-reference/evals/run-output-item-object>.

## Claude

- The pinned model identifiers are `claude-3-5-haiku-20241022`,
  `claude-sonnet-4-20250514`, and `claude-opus-4-1-20250805` for efficient,
  balanced, and strongest capability respectively.
- Claude Code accepts a full model name as well as model aliases. The CLI
  reference gives the full-name form and documents session model selection:
  <https://docs.anthropic.com/en/docs/claude-code/cli-usage>.
- Claude Code's `--effort` values are `low`, `medium`, `high`, `xhigh`, `max`,
  and `ultracode`; Phase 30 maps canonical `extra-high` to `xhigh` and never
  represents those target controls as canonical policy vocabulary. See the
  [Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference).

## Change Rule

Canonical roles retain only `efficient`, `balanced`, or `strongest` capability
and `low`, `medium`, `high`, or `extra-high` effort. Exact target model and
effort overrides are opt-in, schema-validated against this record's pinned
allowlists, and never become canonical role intent.
