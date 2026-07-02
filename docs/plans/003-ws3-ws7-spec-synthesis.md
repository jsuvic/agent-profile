# Spec Candidates: Advanced Capability Slices (WS3-WS7)

## Status

Draft candidates. **Not approved.** Produced by `request-to-spec-issues` from the
grill agreement record for `docs/plans/001-agent-capability-direction.md`, after
the WS0-WS2 slice was spec-written under `docs/specs/phase-12/`. These are the
follow-on slices; each becomes its own numbered phase on approval.

## Shared Intent

Advanced capability, offered early and explicitly, never silently enabled. Every
slice preserves local-first, no source/secret upload, no network by default, no
hosted execution, deterministic generation, lockfile tracking, diff-before-write,
and doctor validation. External or AI-produced input is untrusted data behind a
closed allowlist.

## Shared Decision Rules

- Prefer document-only before settings-generation before content-generation.
- Split risky executing surfaces into their own hardened slices behind a threat
  model; ship the safe advisory/instruction-only form first.
- Any "smarter via network" temptation is replaced by a pinned, shipped, offline
  table, honest about its as-of date.
- External/AI output is data, never instructions to APC; fail closed; report
  ignored input without echoing it.
- APC never executes loops, never runs command-hooks in a first slice, never
  performs external writes.

## Phase Numbering Note

Reviewer subagents have moved earlier: they are now an opt-in Phase 12
capability (the `reviewer-subagents` subagent pack, owned by
`docs/specs/phase-12/008-reviewer-subagents-pack.md`), not a later slice.
`phase-11/README.md`'s Phase 13 reservation now covers only the remaining
subagent follow-on (template references and the `subagent-driven-change`
orchestration), not reviewer subagents. These WS3-WS7 slices should take later
phase numbers assigned at spec-writing time to avoid collision. Recommended
grouping:

- WS4 (MCP recommendation scan) - earliest, unblocks WS3's shared catalog.
- WS3 (`init --assist`) - after WS2 init and the shared catalog.
- WS5 (hooks, advisory slice), WS6 (loop skills), WS7 (memory docs) - parallel-safe.

---

# WS4 - MCP Recommendation Scan (static, offline)

## Problem

Projects using frameworks/runtimes newer than a client's likely knowledge could
benefit from current-docs MCP, but any freshness check risks a network call,
which the product forbids by default.

## Goal

A fully static, offline recommendation scan that flags dependencies newer than
APC's pinned knowledge baseline and points to curated MCP candidates -
informational only, writing nothing.

## Intent / Decision Rules

- Candidates come from a closed curated catalog shared with WS3's
  `suggestedMcpCandidates` enum.
- Freshness comes from a pinned known-as-of baseline table shipped in the
  release. No network, ever.
- APC does not claim to know the active model's knowledge; wording is "newer than
  APC's pinned baseline; current docs may help."

## Non-Goals

- MCP config generation, install, server commands, env var names, tokens, or
  arbitrary MCP ids.
- Any network/registry/package-doc/model-knowledge probe.

## Contracts (binding)

- WS4-MCP-001: no network calls.
- WS4-MCP-002: candidates only from the shipped curated catalog.
- WS4-MCP-003: freshness only from the shipped known-as-of baseline table.
- WS4-MCP-004: recommend candidate ids only; no server commands, install
  commands, config paths, tokens, URLs, or arbitrary MCP names.
- WS4-MCP-005: unknown package or unknown version -> no staleness claim.
- WS4-MCP-006: recommendations are informational; cannot write MCP config.

## Catalog / Baseline Shape

Shared modules (also consumed by WS3):

```ts
type McpCandidate = {
  id: McpCandidateId;            // closed enum
  label: string;
  category: "docs" | "repo" | "testing" | "database" | "filesystem";
  risk: "low" | "medium" | "high";
  requiresSecrets: boolean;
  networkRequired: boolean;
  configGeneration: "not-supported-in-ws4" | "later-opt-in";
};

type KnowledgeBaseline = {
  packageName: string;
  ecosystem: "npm" | "maven" | "python" | "cargo" | "go";
  knownVersion: string;
  knownAsOf: string;             // release/catalog build date
  candidateIds: McpCandidateId[];
  riskCode: "new_framework_version";
};
```

Versions pinned by the release process, never fetched dynamically.

## Detection Rule

1. Normalize package name; find matching baseline entry.
2. Parse detected version.
3. Stable semver > `knownVersion` -> informational `new_framework_version` +
   curated candidate ids.
4. Unknown package -> no staleness claim.
5. Range/prerelease/workspace alias/git URL/non-semver -> `version_not_comparable`,
   informational only.

## Acceptance Criteria

- Scan runs offline; a network sentinel test proves no network access.
- Newer-than-baseline dependency yields `new_framework_version` + candidate ids.
- Non-comparable version yields `version_not_comparable`; unknown yields nothing.
- No MCP config, command, token, or URL ever emitted.

## Issue Briefs

- WS4-I1: shared `McpCandidate` catalog + `KnowledgeBaseline` table modules.
  `ready`; blocks WS4-I2/I3 and WS3-I1.
- WS4-I2: detection rule (semver compare, non-comparable, unknown).
  `sequenced` after WS4-I1.
- WS4-I3: `doctor --mcp-suggestions` / `analyze --mcp-fit` informational output +
  WS4-MCP-001..006; network sentinel test. `sequenced` after WS4-I2.

---

# WS3 - init --assist (read-only AI-CLI analysis)

## Problem

Users want AI help importing/merging existing setup, but letting an external AI
CLI write files breaks the deterministic compiler model and opens a
prompt-injection path from repo files.

## Goal

An opt-in `init --assist` where the chosen local AI CLI runs read-only and
returns a strict recommendation object; APC maps it into an `ai-profile.yaml`
draft and writes via the normal diff -> approve -> atomic path.

## Intent / Decision Rules

- External AI CLI output is recommendation data only - never an instruction
  stream, write plan, command plan, or path authority.
- Closed schema of enums/slugs; unknown/forbidden fields stripped and reported,
  not executed or echoed.
- The assisting CLI can only fill checkboxes; it cannot name files, propose
  writes/commands, bypass diff, ai-profile validation, or doctor.

## Non-Goals

- APC ever acting on a path/command/patch from the assistant.
- Failing the whole run on extra fields (only on invalid JSON, non-object, over
  size cap, or no valid recommendation left).

## Contracts (binding)

- Closed `AssistRecommendationV1` schema (enums/slugs only; `suggestedMcpCandidates`
  from the shared WS4 catalog).
- Two-pass validator: parse+bound -> collect unknown/forbidden -> strip to
  allowlist -> strict validate -> map validated enums/slugs to draft -> normal
  ai-profile validation -> diff -> approve -> single atomic write.
- Ignored recommendations reported by JSON pointer + reason + value type; never
  raw text.
- Hardening rules ASSIST-SEC-001..010 (from the grill record) are binding.
- Mapping targets `capabilities.skills.packs` (from phase-12/002), not a
  `skills.include` shape.

## User Flow

detect installed clients -> user picks one -> run read-only/plan mode
(`codex exec` sandboxed, `claude -p`, `tabnine -p`) -> JSON-only output ->
validate -> map -> diff -> approve -> write -> doctor. On validation failure,
degrade to normal init and report that no recommendation was applied.

## Acceptance Criteria

- Assistant output containing a path/command/patch/unknown field is stripped and
  reported; APC acts only on validated enums/slugs.
- Invalid JSON / non-object / over 64 KiB / no valid recommendation -> degrade to
  normal init, no partial writes.
- All writes go through the single atomic path after diff approval.
- No shell/write/install performed from assistant output.

## Issue Briefs

- WS3-I1: `AssistRecommendationV1` schema + shared catalog wiring. `sequenced`
  after WS4-I1; `blocked` on phase-12/007 (init) and phase-12/002 (packs).
- WS3-I2: two-pass validator (bound, collect ignored, strip, strict-validate)
  with ASSIST-SEC-001..010. `sequenced` after WS3-I1.
- WS3-I3: client detection (`--version`) + read-only invocation adapters
  returning JSON only. `parallel-safe` with WS3-I2.
- WS3-I4: recommendation -> `ai-profile.yaml` draft mapping (targets packs) +
  normal validation. `sequenced` after WS3-I2.
- WS3-I5: assist report (ignored recommendations, applied) + degrade-to-normal.
  `sequenced` after WS3-I4.
- WS3-I6 (human-gate): threat model doc - repo-file prompt-injection, per-tool
  sandbox flags, JSON validation, opt-in gating. Prerequisite for I3/I4 review.

---

# WS5 - Hooks (advisory slice first)

## Problem

Hooks add automation but command-runner hooks carry cross-platform execution and
destructive-shell risk; Windows/PowerShell quoting and missing-binary behavior
are non-trivial.

## Goal

Ship advisory/non-executing hooks first (Claude/Codex, off by default, opt-in
each); defer command-runners to a hardened second slice.

## Intent / Decision Rules

- Slice 1 emits only hooks that run no project binary and fire no destructive
  command.
- Command-runners (format/lint/safety-gate) come in a second slice with the
  `LINT-HOOK-*` catalogue, per-platform command variants, and
  fail-closed-on-missing-binary.

## Non-Goals (slice 1)

- format-on-write, lint-on-write, safety-gate-shell (slice 2).
- Global/user hooks; Tabnine hooks (unverified).
- Executing hooks at compile/doctor time.

## Contracts

- `capabilities.hooks` neutral intent for advisory roles only.
- Advisory roles: `Stop`/`SubagentStop` final-review reminder,
  `UserPromptSubmit` context-injection (git branch/status/changed-files),
  `PreCompact` checkpoint reminder.
- Off by default; Claude/Codex only; project-local.
- No dependency install; no execution during generation/doctor.

## Acceptance Criteria

- Advisory hooks generated only when opted in, only for Claude/Codex.
- No command-runner hooks emitted in slice 1.
- Doctor validates advisory hook artifacts without executing them.

## Issue Briefs

- WS5-I1: `capabilities.hooks` advisory schema. `ready` (after phase-12/002
  schema patterns).
- WS5-I2: advisory hook generation (3 roles), off by default, Claude/Codex.
  `sequenced` after WS5-I1.
- WS5-I3: doctor advisory-hook checks (no execution). `sequenced` after WS5-I2.
- WS5-S2 (later): command-runner slice - `LINT-HOOK-*`, per-platform commands,
  fail-closed. `human-gate` threat model first. Activates
  `phase-later/001-hooks-targets.md`.

---

# WS6 - Loop Workflows (instruction-only skills)

## Problem

Loop workflows are valuable but any APC-driven iteration is background/hosted
execution and risks hidden, uncontrolled work.

## Goal

Generate loop skills in the `automation` pack that document bounded, gated
iteration. APC emits text and never executes or iterates.

## Intent / Decision Rules

- Instruction-only skills; APC launches nothing.
- Each skill hard-codes max-iterations, stop conditions (green / no-diff /
  repeated identical failure), and a human-approval gate before any write or
  destructive step.

## Non-Goals

- APC-executed loops, background mode, autonomous iteration.

## Contracts

- `automation` pack (reserved in phase-12/002) gains loop skill content here.
- Loops: implement->test->fix, review->patch->retest, security->patch->retest,
  docs-update, SDD spec->tests->impl->verify.
- Each generated loop skill includes explicit max-iterations, stop conditions,
  and approval-gate sections.

## Acceptance Criteria

- `automation` pack on -> loop skills emitted for Claude/Codex.
- Each loop skill body contains required stop-condition and approval-gate
  sections (structurally checkable).
- No APC execution path is introduced.

## Issue Briefs

- WS6-I1: `automation` pack loop skill definitions + emission. `sequenced` after
  phase-12/002 (pack schema).
- WS6-I2: doctor structural check that loop skills contain stop-condition +
  approval-gate sections. `sequenced` after WS6-I1.

---

# WS7 - Memory (document-only first slice)

## Problem

Memory is stateful and easy to get wrong; secrets or volatile context can leak
into generated, committed memory files, and memory settings alter runtime
behavior with target-specific precedence.

## Goal

Document how memory works per client; generate no memory content files and no
memory behavior settings in v1.

## Intent / Decision Rules

- v1 documents memory; it does not control memory.
- Split: memory content artifacts vs memory behavior settings - both excluded
  from generation in v1.

## Non-Goals (v1)

- Generating MEMORY.md, remembered facts, project/user/global memory files, or
  custom memory directories.
- Generating memory behavior settings (not even `disable`).

## Contracts

- v1 output is memory guidance documentation (and optionally a memory guidance
  skill/topic) only.
- Verbatim rule included: never store secrets, tokens, credentials, private
  keys, production access, personal/customer data, or one-time debugging context
  in memory.

## Later (recorded, not this slice)

- WS7b: `capabilities.memory.policy` with `inherit` (default) and `disable`
  first; `enable` opt-in later; `contentGeneration: never` long-term.
- WS7c: project-memory scaffolding, opt-in, no secrets, no global writes, doctor
  checks.
- Global/user memory writes require their own approved spec.

## Acceptance Criteria

- Memory guidance doc/skill generated with the verbatim secret rule.
- No memory content files or behavior settings generated.

## Issue Briefs

- WS7-I1: memory guidance topic/skill (document-only). `ready`, `parallel-safe`.

---

## Cross-Workstream Dependency Map

```
WS4-I1 (shared catalog) -> WS4-I2 -> WS4-I3
WS4-I1 ------------------> WS3-I1
phase-12/007 (init) -----> WS3-I1
phase-12/002 (packs) ----> WS3-I1, WS6-I1
WS3-I1 -> WS3-I2 -> WS3-I4 -> WS3-I5
WS3-I6 (threat model, human-gate) -> gates WS3-I3/I4 review
WS3-I3 (parallel-safe with WS3-I2)
WS5-I1 -> WS5-I2 -> WS5-I3 ; WS5-S2 later (human-gate)
WS6-I1 -> WS6-I2
WS7-I1 (independent)
```

## Parallelism Map

- Parallel-safe once their prerequisites are met: WS4 chain, WS5 chain, WS6
  chain, WS7-I1.
- WS3 is gated on WS2 init (phase-12/007), WS1 packs (phase-12/002), the shared
  catalog (WS4-I1), and its own threat model (WS3-I6).

## Human Gates

- Spec approval before implementation for each workstream (SDD required).
- WS3-I6: `init --assist` threat model sign-off before invocation adapters land.
- WS5-S2: command-runner hooks threat model sign-off before that slice starts.

## Recommended Next Step

Land the WS0-WS2 slice (phase-12, now including the opt-in `reviewer-subagents`
pack) first. When advancing WS3-WS7, sequence WS4 -> WS3 and run WS5/WS6/WS7 in
parallel. Assign concrete phase numbers (after Phase 13's remaining
subagent follow-on: template references and `subagent-driven-change`) at
spec-writing time, then draft each workstream's numbered specs the same way
phase-12 was drafted.
