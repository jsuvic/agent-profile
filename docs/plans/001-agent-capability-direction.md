# Plan: Agent Capability Direction (2026-07)

## Status

Research note. **Non-binding.** This is a direction document, not an approved
spec. It combines a brainstorm session (2026-07-01) with a gap analysis of the
current implementation. Each workstream must go through `grill-change` and then
`request-to-spec-issues` / `sdd-change` before any code is written.

## Source

- Brainstorm: ChatGPT session "Setup Research for AI Tools"
  (`https://chatgpt.com/share/6a45739f-00b8-83ed-8cc7-3438fcf949bf`).
- Code survey of `packages/core`, `packages/compiler`, `apps/cli`, and the
  `docs/specs/` tree as of commit `36807de`.

## Executive Summary

The **platform layer already matches the brainstorm's architecture**: one
neutral `ai-profile.yaml`, deterministic compiler, lockfile, doctor checks,
region-merge, diff-before-write, and opt-in project-local subagents. The gaps
are on the **product/UX surface**:

1. The real skill catalog (umbrella `review-change` + specialist reviews +
   `mcp-fit-check`) does not exist as skills.
2. `init` is a preserve-vs-regions wizard, not a setup-profile + capability-pack
   selector with risk labels.
3. There is no AI-CLI-assisted `init --assist`.
4. There is no MCP recommendation scan.
5. Hooks, memory, and loop workflows are draft-only or unspecced.

The guiding principle from the brainstorm's revised conclusion:

> Build advanced capabilities earlier, but gate them through init-time choice,
> risk labels, deterministic generation, doctor validation, and explicit target
> support. Do not silently enable hooks, subagents, MCP servers, memory writes,
> or plugins, but do not postpone all of them unnecessarily.

"Not default" must mean "offered at init with an explicit, risk-labelled
choice," **not** "not implemented."

## Verified Capability Direction (from the brainstorm)

- Codex and Claude now officially expose hooks, subagents, skills, memory,
  plugins, and loop/batch commands. These must be **re-verified against official
  docs at implementation time** and tagged `confirmed-official`,
  `partial-official`, `unknown`, or `not-supported`.
- Tabnine stays **guidelines / MCP / tool-governance** only until docs prove
  parity. Tabnine custom subagents are experimental "YOLO mode" (may run tools
  without per-action confirmation) and must stay skills-first, not generated
  subagents.
- `review-change` is an **umbrella** review skill that triages correctness,
  security-sensitive behavior, readability, tests, performance-when-relevant,
  architecture/contract impact, and generated-file/config drift. Deep
  `security-review` / `readability-review` / `test-review` /
  `architecture-review` stay **separate** specialist skills, and on Claude/Codex
  can later map to subagents.
- The external AI CLI **recommends**; only Agent Profile Compiler **writes**.

## Current State (survey)

- **Schema** (`packages/core/src/profile.ts`): `version`, `profile`, `stack`,
  `clients` (tabnine/codex/claude), `safety.mode` + `requiresSandbox` with
  presets for `guarded|balanced|autonomous|plan-only`, `workflow` flags
  (`sdd`, `tdd`, `finalReview`, `codeReview?`, `refactoring?`, `documentation?`,
  `subagentDrivenDevelopment?`), `capabilities.delegation.subagents` (live,
  opt-in), and `permissions`.
- **Subagent templates** (live): `implementer`, `spec-reviewer`,
  `code-quality-reviewer` — SDD-oriented, not the brainstorm's reviewer set.
- **Compiler** (`packages/compiler/src/compiler.ts`): targets for `agents-md`,
  `claude-md`, `codex-config`, `tabnine-guidelines`, `tabnine-mcp-config`
  (emits empty `{ mcpServers: {} }`), `claude-workflow-skills`,
  `codex-workflow-skills`, subagent targets, and `lockfile`.
- **Emitted skills** (`WORKFLOW_SKILLS`): `grill-change`,
  `request-to-spec-issues`, `sdd-change`, `tdd-change`, `final-review`,
  `subagent-driven-change`. Gated by workflow flags.
- `codeReview` / `refactoring` / `documentation` produce **guidance topics
  only** (AGENTS.md sections + Tabnine guidelines), not invokable skills.
- **Init wizard** (`apps/cli/src/wizard.ts`): detects stack/clients/existing
  files, chooses preserve-vs-regions strategy, offers gitignore updates, and
  defaults to dry-run with an explicit write confirmation. No safety-mode
  choice, no capability packs, no risk labels, no `--assist`.
- **Drafts, not implemented**: hooks (`phase-later/001-hooks-targets.md`),
  memory (`phase-later/006`, `phase-later/016`), MCP declaration schema
  (`phase-later/008`). No loop-workflows spec exists.

## Gap Table

| Brainstorm item | Current state | Gap |
| --- | --- | --- |
| Neutral schema for advanced capabilities | `capabilities.delegation.subagents` live; safety presets exist | `capabilities` has only `delegation`; no skills-packs / hooks / memory / loops / mcp intent |
| Skill catalog | 6 workflow skills emitted | No `review-change`, `security-review`, `readability-review`, `test-review`, `architecture-review`, `mcp-fit-check` |
| Code review = umbrella incl. security/readability/tests | `codeReview` etc. are guidance topics only | Not an invokable umbrella skill; no specialists |
| Subagents | Implemented; SDD-oriented templates | Reviewer templates (security/readability/test/architecture) added in Phase 12 as the opt-in `reviewer-subagents` pack (phase-12 `008`) |
| Init = setup-profile + capability-pack selector w/ risk labels | preserve-vs-regions wizard | No safety-mode choice, no packs, no risk labels |
| `init --assist` (AI CLI -> JSON -> APC writes) | Absent | Whole feature missing |
| MCP recommendation scan | Empty `{ mcpServers: {} }` only | No scan, no `mcp-fit-check` |
| Hooks (opt-in) | Draft `phase-later/001` | Not implemented |
| Memory (document / opt-in generate) | Drafts `006`, `016` | Not implemented |
| Loop workflows | No spec | Missing |
| Plugins | Out of scope in ADRs | Keep blocked (matches brainstorm) |
| Capability matrix / ADR verification | ADR 0005 exists | Needs 2026-07 re-verification + research doc |

## Workstreams

Each workstream lists the concrete repo artifacts to touch and whether it needs
`grill-change` before a spec is drafted. Risk gating and "implement early but
opt-in" apply throughout.

### WS0 - Capability re-verification (docs-only, no risk)

- Add `docs/research/008-current-agent-capabilities-2026-07.md`: the capability
  matrix. Rows: project instructions, global/user instructions, memory, skills,
  MCP config, runtime permissions/safety modes, hooks, subagents, plugins,
  slash/custom commands, loop/batch workflows, admin/team governance,
  import/migration. Columns: Codex support, Claude support, Tabnine support,
  official source URL, verification date, confidence level, project-local
  generation possible?, global/user generation possible?, recommended compiler
  action (MVP generate / later generate / document only / doctor check only /
  unsupported warning / do not support).
- Amend **ADR 0005** (client-capability-model) with 2026-07 verification notes.
- grill-change: no. Unblocks the rest.

### WS1 - Skill catalog expansion (low risk, high value)

All skills are instruction-only, read-first, no tool/shell grants.

- New generated skills with brainstorm descriptions:
  - `review-change` (umbrella): correctness, security-sensitive behavior,
    readability, tests, perf when relevant, architecture/contract impact,
    generated-file/config drift; prioritized findings; no rewrite unless asked.
  - `security-review`: exploit paths, secret exposure, unsafe permissions,
    injection, authz/authn, supply-chain, data leakage.
  - `readability-review`: naming, decomposition, control flow, duplication,
    comments, error-handling clarity, unnecessary abstraction.
  - `test-review`: missing cases, regression coverage, flaky patterns, fixture
    quality, edge cases, behavior-vs-implementation testing.
  - `architecture-review`: module boundaries, dependency direction, contracts,
    migration risk, fit to product architecture.
  - `mcp-fit-check`: recommend MCP/docs/search integrations when deps/frameworks
    are newer than model knowledge; never install or configure automatically.
- Neutral schema: `capabilities.skills.packs` intent -
  `base` (`sdd-change`, `tdd-change`, `final-review`; default on),
  `review` (`review-change`; default on),
  `advanced-review` (`security-review`, `readability-review`, `test-review`,
  `architecture-review`; default off),
  `automation` (loop skills; default off),
  `mcp` (`mcp-fit-check`; default off).
- Compiler: extend `WORKFLOW_SKILLS` / emission to map packs to skill files for
  `.claude/skills` and `.agents/skills`; add Tabnine guideline equivalents where
  a skill cannot map.
- Reviewer subagents (updated direction): also in Phase 12, opt-in. Modeled as a
  subagent capability under `capabilities.delegation.subagents` with
  `enabled: true` and `packs: [reviewer-subagents]` (additive `packs` field, not
  a skill pack). The `reviewer-subagents` pack renders the same neutral reviewer
  definitions as the `advanced-review` skills into Claude/Codex reviewer subagent
  **definition files only** (no launch/loop/test/supervise/patch); Tabnine
  excluded. Owned by phase-12 spec `008`.
- Open decision: does `review-change` supersede or complement the existing
  `codeReview` guidance topic? (Likely: guidance topic body becomes the skill
  body.)
- Golden fixtures + doctor skill checks for each new skill; doctor coverage for
  reviewer subagents reuses `phase-11/005`.
- grill-change: YES. Pin the pack taxonomy, default-on set, and the
  review/guidance overlap.

### WS2 - Init as capability-pack + setup-profile selector (UX, medium)

Target init UX (from brainstorm):

```
Detected: installed clients, existing AGENTS.md/CLAUDE.md, stack
Choose setup profile: 1) Guarded corporate 2) Balanced solo 3) Plan-only review 4) Autonomous sandbox
Choose capability packs (risk-labelled):
  [x] Base instructions            [recommended]
  [x] SDD/TDD workflow skills      [recommended]
  [x] Code review skill            [recommended]
  [ ] Specialist review skills     [optional]
  [ ] Claude/Codex reviewer subagents [optional]
  [ ] Hooks                        [optional]
  [ ] MCP recommendations          [optional]
  [ ] MCP config generation        [advanced]
  ( ) Plugins / global memory / auto-install  [blocked]
Use AI assistant to analyze existing files? 1) No 2) Codex read-only 3) Claude plan 4) Tabnine
Result: ai-profile.yaml, client files, skills, ai-profile.lock, doctor report
```

- Setup profile sets `safety.mode` (presets already exist).
- Capability-pack multi-select with risk labels writes
  `capabilities.skills.packs` and toggles subagents/hooks/mcp intent.
- Extend `WizardOutcome` / `runInitWizard`; keep dry-run default and
  diff-before-write.
- grill-change: YES. Exact prompts, per-profile defaults, pack-to-schema mapping.

### WS3 - `init --assist` read-only AI-CLI analysis (new, medium/high)

Flow: detect installed clients -> ask which to use -> run read-only/plan mode ->
CLI returns **structured JSON only** -> map to `ai-profile.yaml` draft -> diff ->
approve -> deterministic write -> doctor.

- Detection: `codex --version`, `claude --version`, `tabnine --version`.
- Read-only execution: `codex exec` (sandbox + approval flags), `claude -p`
  (permission mode, max turns, JSON output), `tabnine -p` (non-interactive JSON).
- JSON recommendation schema: existing files found, conflicts, likely stack,
  suggested skills, suggested review packs, suggested MCP candidates, risks.
- **Hard contract:** external CLI never writes; APC writes deterministic files
  after diff approval. Reject/ignore any JSON that would write generated
  artifacts, lockfiles, package files, shell commands, or arbitrary paths
  (reuse the web app's fixed-profile write-safety pattern).
- grill-change: YES. Riskiest surface. Needs a threat model: repo-file
  prompt-injection into the CLI, per-tool sandbox flags, JSON validation,
  opt-in gating.

### WS4 - MCP recommendation scan (low/medium)

- `mcp-fit-check` skill (from WS1) plus a doctor mode
  `doctor --mcp-suggestions` / `analyze --mcp-fit` that flags stale-knowledge
  stacks (very new framework/runtime versions) and suggests local/STDIO MCP
  candidates with reasons + risk. Writes nothing.
- Later opt-in: reviewed config-only MCP entries (env var **names**, never
  values). Depends on `phase-later/008` MCP declaration schema going live.
- Boundary (MVP): detect value, explain why, show risk, recommend local/stdio,
  never install, never store literal tokens, never enable remote MCP silently.
- grill-change: YES. Stale-knowledge heuristics, candidate source, config
  generation boundary.

### WS5 - Hooks generation, opt-in (medium/high) - activate phase-later/001

- Promote `phase-later/001-hooks-targets.md` to an active phase.
- Neutral `capabilities.hooks` intent; roles: format-on-write, lint-on-write,
  safety-gate-shell, context-injection, post-stop final-review reminder,
  generated-file drift-check.
- Off by default; Claude/Codex only; fail-closed on missing binary;
  `LINT-HOOK-*` doctor rules already specced; env values via the `006`
  primitive, never inline.
- grill-change: YES. Which roles ship default-off-but-offered, cross-platform
  (Windows/PowerShell) command safety, destructive-shell denylist.

### WS6 - Loop workflows (medium) - new spec

- New `docs/specs/phase-later/xxx-loop-workflows.md`: implement->test->fix,
  review->patch->retest, security->patch->retest, docs-update, and
  SDD spec->tests->impl->verify. For each: trigger, max iterations, stop
  conditions, required user approval gates, and whether it is a skill / subagent
  workflow / hook / external script, plus how to prevent hidden uncontrolled
  work.
- Likely expressed as **skills** that orchestrate existing subagents;
  not autonomous background loops in MVP.
- grill-change: YES. Stop conditions and approval gates are the safety story.

### WS7 - Memory (low, mostly docs)

- Per brainstorm: document memory, do not generate by default; global/user
  writes require a separate opt-in spec. Activate `phase-later/006` + `016` as
  document-only plus optional project-memory generation.
- grill-change: YES, lowest priority.

## Explicitly NOT Now

- Plugins generation (keep blocked-by-default).
- Auto-install of any MCP / hook / dependency.
- Global/user memory writes without a separate approved spec.
- Remote/hosted MCP, gateways, telemetry.
- Cursor / Aider / Copilot targets.

## Suggested Sequencing

1. WS0 (verification) -> WS1 (skill catalog) -> WS2 (init selector). Highest
   value, lowest risk, unblocks faster implementation.
2. WS4 (MCP scan) + WS6 (loops) as skills - cheap once WS1 lands.
3. WS3 (`--assist`) and WS5 (hooks) - highest risk; do grill-change +
   threat-model first.
4. WS7 (memory) last.

## Open Questions For grill-change

- Does `review-change` replace or wrap the current `codeReview` guidance topic?
- Exact pack taxonomy and which packs are default-on per setup profile.
- Per-profile init defaults and how pack selection maps to schema toggles.
- `--assist` threat model: prompt-injection, per-tool sandbox flags, JSON
  validation, opt-in gating.
- MCP stale-knowledge heuristics and the config-generation boundary.
- Hook roles shipped default-off-but-offered; Windows command safety.
- Loop stop conditions and approval gates; skill vs subagent vs hook.
- Memory: document-only vs optional project-memory generation.
