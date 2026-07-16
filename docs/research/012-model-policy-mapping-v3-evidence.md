# Model Policy Mapping v3 Evidence

## Status

Status: approved evidence baseline for Phase 31.5 planning.

Mapping/catalog version: 3 candidate.

Verified: 2026-07-16.

This note replaces neither the bundled catalog nor implementation-time
verification. It records the official evidence and documentation gaps used to
approve `docs/specs/phase-31.5/001-model-selection-lifecycle.md`. Exact client
versions and invocations MUST be refreshed when the target adapters are
implemented.

## Evidence rules

- `confirmed-official`: an official model or client page states the behavior.
- `release-claim`: an official announcement states availability, but the
  client reference has not caught up.
- `client-verification-required`: the public sources are incomplete or
  inconsistent; tests and a bounded local verification are required.
- `organization-specific`: only the installed/admin-controlled environment can
  determine the answer.

Account promotions and quota allowances are not model-catalog facts. They
expire or vary by user and must never be embedded in the catalog.

## Codex

Official Codex model guidance lists:

| Display name | Exact identifier | Catalog role | Evidence |
| --- | --- | --- | --- |
| GPT-5.6 Sol | `gpt-5.6-sol` (`gpt-5.6` alias) | strongest | confirmed-official |
| GPT-5.6 Terra | `gpt-5.6-terra` | balanced | confirmed-official |
| GPT-5.6 Luna | `gpt-5.6-luna` | efficient | confirmed-official |

Sources:

- <https://developers.openai.com/codex/models>
- <https://developers.openai.com/api/docs/models>
- <https://developers.openai.com/codex/multi-agent>
- <https://developers.openai.com/codex/config-reference>

The model catalog documents `none`, `low`, `medium`, `high`, `xhigh`, and
`max` for the GPT-5.6 API family. The Codex model UI additionally describes
`Ultra`, while the current config reference documents a narrower persistent
`model_reasoning_effort` set. Phase 31.5 therefore keeps canonical
`extra-high -> xhigh`; `max` and `ultra` are not portable canonical effort
values and require separate target evidence before configuration.

Codex documents per-agent `model` and `model_reasoning_effort`, a project-local
`.codex/config.toml`, and `--model`/interactive `/model` selection. The target
adapter must still distinguish project configuration, agent configuration, and
advisory primary-workflow guidance rather than claiming one surface controls
all three.

## Claude

| Display name | Exact identifier | Catalog role | Evidence |
| --- | --- | --- | --- |
| Claude Fable 5 | `claude-fable-5` | strongest preferred | release-claim |
| Claude Opus 4.8 | `claude-opus-4-8` | strongest fallback/legacy | confirmed-official |
| Claude Sonnet 5 | `claude-sonnet-5` | balanced | release-claim |
| Claude Haiku 4.5 | `claude-haiku-4-5` | efficient | confirmed-official |

Sources:

- <https://www.anthropic.com/claude/fable>
- <https://www.anthropic.com/news/claude-sonnet-5>
- <https://www.anthropic.com/news/claude-opus-4-8>
- <https://www.anthropic.com/claude/haiku>
- <https://code.claude.com/docs/en/model-config>
- <https://code.claude.com/docs/en/cli-usage>

Anthropic's announcements state that Fable 5 and Sonnet 5 are available in
Claude Code and publish their API identifiers. At verification time, the
Claude Code model-configuration reference still primarily describes the
Opus/Sonnet 4.x generation and its effort matrix. Exact Fable 5 and Sonnet 5
Claude Code effort/frontmatter behavior is therefore
`client-verification-required`, not a completed implementation fact.

Fable 5's documented safety routing to Opus 4.8 is not an entitlement or quota
fallback. Agent Profile must not describe it as proof that a Fable selection
will remain available after a promotion, limit, or organization-policy change.

## Tabnine

Tabnine documents that `/model` opens an interactive list, `/about` displays
the current model, and the choice persists in project/user
`.tabnine/agent/settings.json`. The settings schema documents a project-local
`model.id`. These are confirmed official behaviors:

- <https://docs.tabnine.com/main/getting-started/tabnine-cli/features/model-selection>
- <https://docs.tabnine.com/main/getting-started/tabnine-cli/features/settings>

Tabnine also documents that enterprise administrators choose available/default
models and may provide OpenAI-compatible private model identifiers. Its model
list changes frequently:

- <https://docs.tabnine.com/main/administering-tabnine/managing-your-team/settings/models-settings>

The July 16 baseline includes documented families such as Claude 4.6/4.5,
Claude 4 Sonnet, GPT-5.4, GPT-5.3/5.2 Codex, GPT-5.2, GPT-5, GPT-4o, Gemini
3.0/2.5, Devstral, MiniMax, and Qwen. This is not a universal availability
allowlist. SaaS, VPC, private, and organization-managed installations may
expose a narrower, older, or private set.

Catalog policy:

- retain every previously known exact Tabnine identifier as compatibility
  history;
- mark entries `current`, `supported-legacy`, `deprecated`, or `retired`;
- hide retired entries from ordinary init choices without deleting them;
- accept an organization/private exact identifier as unrated and unverified;
- do not scrape `/model` when no documented machine-readable listing exists;
- do not invent a Tabnine effort control.

## Default role-aware candidate

| Workflow role | Capability | Effort | Codex | Claude |
| --- | --- | --- | --- | --- |
| grill, architect | strongest | extra-high | Sol / `xhigh` | Fable 5 / `xhigh` candidate; Opus 4.8 fallback |
| critical/final review | strongest | extra-high | Sol / `xhigh` | Fable 5 / `xhigh` candidate; Opus 4.8 fallback |
| spec and quality review | strongest | high | Sol / `high` | Fable 5 / `high` candidate; Opus 4.8 fallback |
| complex implementation | balanced | high | Terra / `high` | Sonnet 5 / `high` candidate |
| normal implementation | balanced | high | Terra / `high` | Sonnet 5 / `high` candidate |
| routine implementation | balanced | medium | Terra / `medium` | Sonnet 5 / `medium` candidate |
| exploration | efficient | low | Luna / `low` | Haiku 4.5 / client-supported effort or advisory |
| mechanical work | efficient | medium | Luna / `medium` | Haiku 4.5 / client-supported effort or advisory |

Tabnine resolves the same portable intent only against an organization-visible
exact model. Agent Profile shows the exact result and status but does not rank
an unknown private model or treat an older admin-approved model as unhealthy.

## Implementation-time evidence gaps

Before the mapping is shipped, the target specs must verify:

1. Current Codex and Claude CLI versions and exact non-persistent source-free
   invocation flags.
2. Whether either CLI exposes a documented machine-readable model listing.
3. Fable 5 and Sonnet 5 model/effort behavior in Claude Code, including skill
   and subagent frontmatter.
4. Which Codex primary, skill, and subagent surfaces can configure exact model
   and effort versus provide guidance only.
5. Tabnine's exact headless model-override contract and whether one validation
   call can avoid changing the persisted current model.
6. Stable error evidence sufficient to classify probe failures; ambiguous
   failures must remain `unknown`.
