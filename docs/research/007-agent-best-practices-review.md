# Research: Agent Best-Practices Review

Status: Research draft, 2026-05-16.

## Purpose

The repository's stated mission is broader than just *syncing* configuration
between AI coding agents (Claude Code, Codex, Tabnine, and later peers): it
should also encode a *best-practice setup* for each agent — well-described
subagents with the right model and tool surface, focused skills with strong
triggers, safe hook coverage, a coherent memory taxonomy, and a multi-lens
review/debug story. This document audits the current setup against that
broader goal, calls out every missing dimension, and routes each gap to the
phase-later spec that should track it. Nothing is implementation work; this is
gap analysis and roadmap routing.

The audit covers MVP-shipped artifacts (`AGENTS.md`, `CLAUDE.md`, generated
Claude/Codex/Tabnine config, the three MVP workflow skills, the lockfile, and
doctor) plus the phase-later backlog under `docs/specs/phase-later/`.

## Method

For each best-practice dimension, the review records:

1. Current state — what the repository already generates or specifies.
2. Gap — what is missing, partially specified, or silently deferred.
3. Routing — which phase-later spec owns the gap. Existing phase-later specs
   are expanded inline; new specs are created in `docs/specs/phase-later/`
   when no home exists.

Ecosystem scope is widened past the MVP targets (Codex, Claude, Tabnine) to
cover Cursor, Aider, Cline, Continue, and Roo Code, on the user's instruction.
Wider ecosystem coverage remains explicitly deferred behind approved specs;
this review only proposes the routing, not the implementation.

## Current Setup Snapshot

What MVP already produces or pins down:

- Shared instructions: generated `AGENTS.md` and `CLAUDE.md` (with
  `@AGENTS.md` import). `phase-01/004-agents-md-target.md`,
  `phase-03/003-claude-md-target.md`.
- Per-client config: `.claude/settings.json`, `.mcp.json`, `.codex/config.toml`,
  `.tabnine/guidelines/*.md`, `.tabnine/mcp_servers.json` (empty placeholder).
  `phase-03/001-codex-config-target.md`, `phase-03/002-claude-config-target.md`,
  `phase-02/002-tabnine-mcp-config-target.md`.
- Workflow skills: three skills (`sdd-change`, `tdd-change`, `final-review`)
  generated under `.claude/skills/` and `.agents/skills/`, frontmatter-only,
  no `allowed-tools`, no scripts/references/assets, no plugins, no subagents.
  `phase-03/004-codex-workflow-skills-target.md`,
  `phase-03/005-claude-workflow-skills-target.md`.
- Safety primitives: `safety.mode`, derived `effectivePermissions`, ask/deny
  rules, `disableBypassPermissionsMode` and `disableAutoMode` guards. Doctor
  checks size/triggers of skills, drift, permission posture, structural,
  secret-like literals, semantic warnings.
- Determinism: golden tests with byte-exact comparison, LF endings, single
  trailing newline, stable key order, lockfile drift.

What MVP intentionally excludes (per ADR 0005):

- hooks, subagents, plugin packaging
- global/user memory writes
- dedicated knowledge MCP
- automatic third-party MCP installation
- Cursor, Aider, Copilot output targets (AGENTS.md scope rule)

What phase-later already drafts:

| Spec | Status today | Coverage |
| --- | --- | --- |
| `001-hooks-targets.md` | Thin draft | Hook intent placeholder; no event taxonomy, no lint/format examples |
| `002-subagents-targets.md` | Detailed draft | Full schema, Claude/Codex/Tabnine targets, doctor lints, drift behavior |
| `003-plugin-packaging-targets.md` | Thin draft | Plugin packaging placeholder; no Claude `.plugin` format, no marketplaces |
| `004-cli-diff-command.md` | Deferred | Standalone `diff` command |
| `005-environment-shell-pinning.md` | Draft | `environment` block in profile |
| `006-secrets-and-memory-integration.md` | Draft | `secrets` and `memory` *references*; no auto-memory taxonomy |
| `007-monorepo-cascading-config.md` | Draft | Workspace cascade |
| `008-mcp-server-declaration-schema.md` | Draft | `mcp.servers` schema |
| `009-sonarqube-mcp-worked-example.md` | Draft | Worked example on top of 008 |
| `010-cli-init-output-and-target-selection.md` | Draft | Init UX refinement |

What the capability matrix flags as `confirmed-official` for Codex/Claude but
has no phase-later spec at all: slash commands, skill bundled resources, status
line / output style, auto-memory file taxonomy, review perspective skills,
code-quality enforcement skill, broader ecosystem targets. Subagents are now
covered by `002`, which is detailed enough to lift into a numbered phase; the
remaining subagent-specific gap is a curated *template library* of well-formed
subagent definitions (code-reviewer, bug-hunter, security-auditor, etc.),
which `002` intentionally leaves out of the schema spec.

## Best-Practice Framework

Seven dimensions, each scored against what a real, sharp engineer would expect
from a production AI coding workflow.

### 1. Subagent orchestration

Best practice. A subagent definition should be more than `name` + a one-liner
description. It must specify:

- **Description** — a paragraph that names the trigger phrases, the inputs the
  subagent expects, the deliverable it returns, and explicit edge cases. The
  user note in the brief was emphatic on this: "a specific well-written, not
  just short description."
- **Model** — Sonnet / Opus / Haiku per task (cost + capability fit). Claude
  Code lets each subagent override the parent model.
- **Tools** — an explicit allowlist (e.g. Read, Grep, Glob, WebFetch — no
  Edit/Write for a research agent; no Bash for a doc reviewer). Reducing tool
  surface reduces both blast radius and prompt confusion.
- **System prompt** — the role, the working method, output contract, refusal
  rules, and "never delegate understanding" reminders.
- **Isolation hints** — worktree vs. inline, parallelism notes, when to spawn
  multiple in one turn vs. sequential.

Current state. `phase-later/002-subagents-targets.md` already covers the
schema, the per-client mapping for Claude/Codex/Tabnine, the doctor lint
catalogue (`LINT-SUBAGENT-001` … `008`), drift/orphan behavior, cross-phase
amendments, and the open question on Tabnine's experimental
no-confirmation runtime. The spec is detailed enough to lift into a numbered
phase.

Gap. The schema is well-specified; what is still missing is a curated
**subagent template library** that ships as `packages/templates` content.
Without baseline templates, every adopter has to author definitions from
scratch and is likely to under-describe them — the exact failure mode the
user called out ("not just short description"). Recommended baseline set:
`code-reviewer`, `bug-hunter`, `security-auditor`, `doc-reviewer`,
`test-writer`, `spec-drafter`, `research-explorer`, `incident-responder`.

A narrower implementation-review bundle is also missing: a workspace-write
implementation worker, a read-only spec-compliance reviewer, a read-only
code-quality reviewer, explicit status values, fresh-context prompting, and a
two-stage review order where spec compliance passes before code-quality review
starts.

Routing. `phase-later/002-subagents-targets.md` covers the schema and target
generation and has now been lifted into `phase-11`. The broad template library
belongs to `phase-later/017-subagent-template-library.md`. The exact
implementation-review bundle belongs to `docs/specs/phase-13/` after Phase 11
is implemented.

### 2. Skills — triggers, structure, progressive disclosure

Best practice. A good skill carries:

- **Description with triggers** — names the user phrases, "use when" /
  "trigger when" language, and a paragraph long enough to make Claude pick it
  over neighbours. Anthropic skills guidance calls out *undertriggering* as
  the typical failure.
- **Structure** — SKILL.md frontmatter (`name`, `description`,
  `compatibility` if needed), progressive disclosure (body <500 lines, deeper
  refs in `references/`, deterministic helpers in `scripts/`, output stencils
  in `assets/`).
- **Imperative voice** with the *why* spelled out, not just `MUST` walls.
- **Doctor coverage** — size, trigger language, secret-literal scan, dynamic
  context absence.

Current state. The three MVP skills are correctly minimalist for the MVP
scope. The Codex/Claude skill target specs explicitly forbid emitting
`allowed-tools`, scripts, references, assets, plugins, subagents,
slash-injected shell, user/admin/system scope.

Gap.

- **TDD hardening** is missing from the existing `tdd-change` skill. The skill
  should require an explicit RED command and expected failure reason, a GREEN
  command and passing result, and a short anti-pattern gate for mock-heavy
  tests and test-only production APIs.
- **Skill bundled resources** (`scripts/`, `references/`, `assets/`) have no
  later spec, so users cannot ship deterministic helpers or hierarchical
  references via the compiler.
- **Multi-perspective review skills** are absent. The single `final-review`
  skill collapses all lenses (spec compliance, security, tests, docs) into
  one numbered list, which means an agent reviewing a diff scans once and
  moves on. Best practice is one skill per lens (security, performance,
  correctness, accessibility, UX, dependency, secret-leak) so each gets a
  dedicated pass.
- **Code-quality skill** (the user's five principles — naming, SRP,
  predicate extraction, formatting, intent-over-implementation) has no spec
  and no skill.
- **Description-optimization loop** (skill-creator pattern of trigger evals)
  is not part of doctor; descriptions can drift to vague phrasings without
  the linter catching it beyond the current `LINT-SKILL-002`.

Routing.

- New spec - `phase-10.5/001-tdd-skill-red-green-hardening.md`. Ships the
  early RED/GREEN and testing anti-pattern hardening in existing workflow
  skills before Phase 11.
- New spec — `phase-later/012-review-perspectives-and-code-quality.md`. Ships
  perspective-split review skills plus a code-quality skill encoding the five
  principles.
- New spec — `phase-later/011-skill-bundled-resources.md`. Defines optional
  `scripts/`, `references/`, `assets/` emission with strong safety gates
  (no shell at generate time; only deterministic helpers; size caps).

### 3. Hook coverage

Best practice. Hook generation should enumerate per-event coverage per
target and explicitly list the lint/format/safety roles each event plays.

- **Claude Code hook events**: SessionStart, SessionEnd, UserPromptSubmit,
  PreToolUse, PostToolUse, Notification, Stop, SubagentStop, PreCompact.
- **Codex hook events**: equivalent set per official docs at the time of
  implementation (re-verify).
- **Tabnine**: hook capability `unknown` until verified.

A good hook surface covers, at minimum:

- *PostToolUse on Edit/Write* — formatter (`prettier`, `black`, `gofmt`),
  linter (`eslint`, `ruff`), type-check fast path. Failure becomes feedback to
  the agent without auto-installing tools.
- *PreToolUse on Bash* — deny dangerous patterns (`sudo`, `rm -rf /`,
  network installs without lockfile), record approvals.
- *UserPromptSubmit* — inject git status / branch / changed file list when the
  prompt is non-trivial, so the agent sees current state.
- *SessionStart / SessionEnd* — pull memory snapshots, persist deltas.
- *PreCompact* — checkpoint long-running work before context compaction
  drops it.

Current state. `phase-later/001-hooks-targets.md` is correct in spirit but
~70 lines and enumerates none of the above. The real `.codex/hooks.json` in
this very repo (CCE-generated, not by the compiler) already wires
`PostToolUse`, `SessionStart`, `UserPromptSubmit`, and `Stop` — so the
upstream client supports the surface and the spec just hasn't caught up.

Gap. Event taxonomy per target, lint/format/safety examples, doctor checks
for "hook command is destructive" or "hook installs deps".

Routing. Expand `phase-later/001-hooks-targets.md` (edited in this pass).

### 4. Memory taxonomy

Best practice. Memory should be split into named, durable file types so a
future session can pick up the thread without re-reading the whole repo:

- **user** — role, expertise, preferences.
- **feedback** — corrections and validated successes, each with *Why* and
  *How to apply*.
- **project** — current initiatives, decisions, deadlines.
- **reference** — pointers to external systems (Linear projects, Grafana
  boards, Slack channels).

This is orthogonal to *secret/memory references* (which are about telling the
agent where keys and vector stores live). Both need to coexist.

Current state. `006-secrets-and-memory-integration.md` covers *references
to* external memory backends (CCE, vector stores). It does **not** describe an
auto-memory file taxonomy with frontmatter (`name`, `description`, `type`) and
a `MEMORY.md` index, even though Cowork mode (the Claude.ai surface) already
ships exactly that taxonomy as a built-in mechanism.

Gap. Generating an opt-in memory scaffold so multiple agents (Claude Code,
Codex, Cursor) can share a consistent set of memory files. Doctor checks for
"index points to missing file", "memory file missing type", "user memory
contains protected attributes" (race, religion, government IDs, financial
account details — the same exclusion list every agent should follow).

Routing. New spec — `phase-later/016-auto-memory-taxonomy.md`. Cross-ref
from `006` (edited in this pass) so the two memory specs don't collide.

### 5. Plugins / MCP / marketplaces

Best practice. Plugins are how Claude Code and Codex ship bundled skills,
subagents, hooks, MCP servers, and slash commands as a single installable
unit. A real plugin spec covers:

- Plugin manifest (Claude `.plugin` files; Codex equivalent).
- Bundled MCP server declarations (cross-ref MCP schema spec `008`).
- Bundled subagents (cross-ref subagents spec `002`).
- Marketplace registration metadata — short code, distribution channel.
- Trust model — pinned versions, signature verification, install scope.

For MCP itself:

- Pinned-digest images for docker runtimes, env-only credentials, transport
  selection (stdio default; http/sse explicit opt-in), per-client routing.

Current state. `008-mcp-server-declaration-schema.md` is well-developed.
`009-sonarqube-mcp-worked-example.md` exercises it. `003-plugin-packaging-targets.md`
is ~80 lines and does not name the Claude `.plugin` format or the marketplace
concept.

Gap. Plugin spec needs (a) plugin file layout, (b) marketplace metadata,
(c) cross-references to subagents and hooks and skill resources.

Routing. Expand `phase-later/003-plugin-packaging-targets.md` (edited in
this pass).

### 6. Review perspectives (the multi-lens problem)

Best practice. Reviewing a change against a single "looks good?" prompt
misses concrete classes of issues. A good review pipeline applies lenses in
sequence or parallel:

- **Security** — auth, injection, secret exposure, sandbox-escape, dependency
  CVEs.
- **Performance** — N+1, allocation hot paths, async correctness, complexity.
- **Correctness** — boundary conditions, error handling, idempotency,
  contract drift.
- **Accessibility / UX** — keyboard nav, ARIA, color contrast, copy clarity.
- **Test gaps** — uncovered branches, missing failure-mode tests.
- **Documentation** — public API drift, runbook freshness.
- **Secret-leak** — token shapes in logs, fixtures, prints.
- **Bug-search** — explicit hunt for typos, off-by-ones, wrong field names,
  reversed comparisons.

Each lens benefits from its own skill or subagent so the agent can't shortcut.

Current state. The single `final-review` skill encodes seven bullets that
roughly overlap with these lenses but in one pass. There is no security or
performance specialist skill, no bug-hunter, no a11y reviewer.

Gap. Per-lens review skills + corresponding subagent definitions.

Routing. Same spec as the code-quality skill —
`phase-later/012-review-perspectives-and-code-quality.md`.

### 7. Code-quality enforcement

Best practice. Encode the five principles the user named into something the
agent and the human reviewer can both consult:

1. *Intentional naming and no magic numbers* — central constants module
   reference, named flags rather than booleans.
2. *Single Responsibility* — one function, one concept; split when a function
   bridges two abstractions.
3. *Extract complex logic* — boolean predicates as named variables, early
   returns, no arrow antipattern.
4. *Automate formatting/linting* — ESLint, Prettier, Black, Ruff, gofmt
   wired into PostToolUse hooks (cross-ref the hooks spec).
5. *Intent over implementation* — comments say *why*, not *how*; dead code
   removed.

These are simultaneously: a generated skill (the agent reads them before
editing), a doctor warning catalogue (flag magic numbers in commit-changed
files, oversized functions), and a section in generated `AGENTS.md` /
`CLAUDE.md` (so the agent sees them at session start).

Current state. Nothing. Generated `AGENTS.md` has Safety Rules but no
style/quality rules. Generated skills mention "focused tests" and
"determinism" but not naming/SRP/predicate extraction.

Routing. Same spec as review perspectives —
`phase-later/012-review-perspectives-and-code-quality.md`. The spec lists
both the review skills *and* the code-quality skill so the bundle ships
coherently.

## Cross-Cutting Surfaces Still Missing

These are not in any phase-later spec today.

### Slash commands

Claude Code supports `.claude/commands/<name>.md`; Codex skills can be
invoked with `$skill`. Generating these from profile intent (e.g. team
shortcuts like `/standup`, `/incident`, `/deploy-check`) is a clean follow-on
to the workflow skills. New spec — `phase-later/013-slash-commands-targets.md`.

### Status line / output style

Claude Code exposes a `statusLine` and an `outputStyle` setting that tunes
how the agent reports progress. Teams that adopt a house style (terse, no
trailing summaries, fragments over sentences — see this repo's CLAUDE.md
Output Style section) should be able to declare it once and have the compiler
ship the right settings across clients that support it. New spec —
`phase-later/014-status-line-and-output-style.md`.

### Extended ecosystem targets

The AGENTS.md scope rule blocks Cursor / Aider / Copilot until a spec adds
them. Still, the user's brief explicitly asked for an ecosystem-wide audit.
Coverage targets that surface in real teams:

- **Cursor** — `.cursor/rules/*.mdc`, `.cursorignore`, MCP via Cursor
  settings.
- **Aider** — `CONVENTIONS.md`, `.aider.conf.yml`, command shortcuts.
- **Cline** — `.clinerules/`, MCP marketplace.
- **Continue** — `config.yaml`, model + tool routing.
- **Roo Code** — `.roo/` per-mode prompts.

These should land as a single ecosystem-extension spec that mirrors the MVP
target contract style. New spec —
`phase-later/015-extended-ecosystem-targets.md`. The capability matrix gets
added rows (without inventing support claims) only after that spec exists.

### Skill bundled resources

Already routed under the skills section above to
`phase-later/011-skill-bundled-resources.md`.

### Subagent template library

`002` defines the schema for subagents but leaves the curated set of
*example subagents* (and the orchestration patterns they imply) out of scope.
This is intentional: schema and example library should be approved
separately. The template library is where well-described subagents like
`code-reviewer` (multi-paragraph description, Opus model, read-only tool
allowlist) actually land as packaged content. New spec —
`phase-later/017-subagent-template-library.md`.

### Implementation-review subagent workflow

The exact implementation delegation workflow is split out from the broad
template library so it can land immediately after the Phase 11 foundation. New
spec map - `phase-13/`:

- `001-subagent-template-reference-schema.md`
- `002-implementation-review-subagent-templates.md`
- `003-subagent-driven-change-skill.md`

This phase adds the `implementer`, `spec-reviewer`, and
`code-quality-reviewer` templates plus the parent `subagent-driven-change`
skill.

## Five Code-Quality Principles, Routed

User principles → where they land in the system:

| Principle | Skill body | Generated AGENTS.md | Hooks | Doctor |
| --- | --- | --- | --- | --- |
| Intentional naming, no magic numbers | code-quality skill | style rule | none | future literal-number scan |
| Single Responsibility | code-quality skill | style rule | none | future function-size heuristic |
| Extract complex logic | code-quality skill, code-review skill | style rule | none | future nesting-depth heuristic |
| Formatting & lint automation | testing-strategy skill | style rule | PostToolUse formatter / linter | hook-validity check |
| Intent over implementation | code-review skill | style rule | none | future commented-out code scan |

All landing locations live behind the same `phase-later/012` spec plus the
expanded `phase-later/001-hooks-targets.md`.

## Recommended Roadmap Ordering

In priority order, after the current MVP is verified:

1. `phase-10.5/001-tdd-skill-red-green-hardening.md` - small, low-risk
   improvement to existing workflow skills; no schema change.
2. `phase-11/` - subagent foundation: schema, generated files, lockfile,
   permissions, and doctor checks.
3. `phase-13/` - implementation-review subagent workflow: template
   references, three role templates, status reporting, fresh-context prompting,
   and two-stage review.
4. `phase-later/011-skill-bundled-resources.md` - unlocks every other
   resource-heavy skill (code-quality stencils, review checklists).
5. `phase-later/012-review-perspectives-and-code-quality.md` - biggest user
   value once 011 exists.
6. Expanded `phase-later/001-hooks-targets.md` - needed to wire formatters
   and lint gates.
7. `phase-later/016-auto-memory-taxonomy.md` - needed so the agents are
   coherent across sessions.
8. `phase-later/017-subagent-template-library.md` - broader curated baseline
   subagents once Phase 11, Phase 13, and `011` land.
9. `phase-later/013-slash-commands-targets.md` - quick win once skills are
   richer.
10. Expanded `phase-later/003-plugin-packaging-targets.md` - packaging once
    there is enough content to package.
11. `phase-later/014-status-line-and-output-style.md` - polish, after the
    substance lands.
12. `phase-later/015-extended-ecosystem-targets.md` - ecosystem expansion
    after Claude / Codex / Tabnine targets are mature.

Numbering note: the Flutter/Dart stack detection spec is already verified as
Phase 12, so the implementation-review subagent workflow uses Phase 13.

## Open Questions

These need decisions before the routed specs can be approved.

- Subagent runtime safety. `phase-later/002-subagents-targets.md` already
  documents that Tabnine custom subagents are experimental and may execute
  tools without per-action confirmation. The spec routes the risk to
  `LINT-SUBAGENT-007/008` and gates `workspace-write` Tabnine subagents. The
  open question is whether to ship Tabnine read-only subagents at all in the
  first implementation or wait for the upstream confirmation behaviour.
- Code-quality enforcement is opinion. Should generated AGENTS.md
  ship the five principles by default, or behind a `quality.enabled: true`
  flag in the profile? The conservative default is "opt-in" so the compiler
  does not impose style on teams.
- Memory taxonomy collision. If a project uses Cowork-style auto-memory
  *and* the compiler-generated memory scaffold, who owns the index? The
  `phase-later/016` spec must define a single source of truth and a doctor
  check for divergence.
- Ecosystem MCP duplication. The current `.mcp.json` in this repo has
  `cce-agent-profile-79781b` and `context-engine` pointing at the same
  binary. Once the MCP schema lands (`008`), doctor should catch duplicate
  servers by command + args.

## Cross-References

- ADR 0005 — `docs/architecture/decisions/0005-client-capability-model.md`
- Capability matrix — `docs/research/006-client-capability-matrix.md`
- Skill best practices already captured —
  `docs/research/004-best-practices-per-artifact.md`
- Phase-later index — `docs/specs/phase-later/`

## Final Review Checklist (for this research doc)

- every dimension cites at least one existing spec or names a new spec
- gaps that fit existing phase-later specs are noted as edits made in the
  same pass
- gaps with no existing home create exactly one new spec each
- ecosystem expansion is deferred behind an explicit spec, not added to MVP
  silently
- code-quality principles route to skill, AGENTS.md, hooks, and doctor
  individually
- no implementation work is requested in this doc; only routing
