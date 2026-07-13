# Spec: Role-Aware, Indexed Subagent Execution

## Status

Approved on 2026-07-13. Synthesized from the completed and approved subagent
model/effort, indexed-context, memory, and evidence grill. Governed by ADRs
0015-0017.

## Problem

Subagents consume unnecessary context and token budget when they receive broad
chat history, rediscover the repository with wide file reads, use unnecessarily
strong models for mechanical work, or delegate recursively. Indexed repository
context is inconsistently installed, indexed, registered, approved, and
healthy across Codex and Claude. Current execution also lacks enough local,
privacy-preserving evidence to review whether the policy actually helps.

## Goal

Add an opt-in, provider-neutral subagent execution policy that selects
capability and effort by role, sends isolated task capsules, bounds delegation,
prefers a verified local repository index, degrades safely when unavailable,
and emits enough metadata-only evidence to debug and improve the policy. CCE is
the first and recommended indexed-context adapter, never a prerequisite.

## Intent

Spend context and model capability where they change correctness. Preserve the
existing review chain and local-first guarantees while making repository
discovery focused, setup diagnosable, repair explicit, and policy outcomes
auditable without telemetry or content capture.

## Decision Rules

1. Express role requirements as stable capability classes; keep exact model
   names and target effort controls in versioned client mappings (ADR 0016).
2. Send the minimum authoritative task capsule; do not inherit full chat or
   unrelated memory by default.
3. Prefer indexed repository context when ready; otherwise enter a visible,
   bounded degraded mode rather than block work (ADR 0015).
4. Use sequential implementation -> spec review -> quality review. Parallelize
   only independent read-only work; maximum depth is 1 and maximum concurrent
   threads is 3.
5. Diagnose read-only. Install, index, approve, or register only through an
   explicit user-controlled action; `--write` may repair safe registration
   state but never install CCE or create its repository index (ADR 0017).
6. Persist metadata, not prompts, source, tool payloads, diffs, or secrets.

## Non-Goals

- Requiring, auto-installing, or auto-indexing CCE.
- Blocking work when indexed context is absent or unhealthy.
- Supporting a second indexed-context provider in this phase.
- Automatically approving Claude MCP servers or preapproving tools.
- Inventing Tabnine model, effort, subagent, or MCP controls.
- Parallel or overlapping repository writes, recursive delegation, or broad
  autonomous task loops.
- Full chat-history handoff, broad memory injection, or repository-content
  persistence in evidence.
- Telemetry, hosted execution, remote indexing, source upload, or guaranteed
  token-savings percentages.
- Silently changing existing profiles, global client configuration, or model
  mappings outside an explicit release.

## User Flow

1. The user explicitly adopts `subagentPolicy` in `ai-profile.yaml`; profiles
   without it compile byte-identically.
2. `agent-profile doctor --indexed-context` reports one normalized state and
   bounded next steps without changing the machine.
3. If CCE is not installed or the repository is not indexed, the user is
   advised how to do that. APC does not perform either action.
4. `agent-profile setup indexed-context --provider cce` previews client
   registration changes. Adding `--write` performs only safe, preflighted
   registration repair. Claude approval remains an interactive Claude action.
5. Generated Codex and Claude guidance selects role defaults, builds a task
   capsule, checks indexed-context readiness, and either uses focused indexed
   retrieval or declares degraded mode and bounded native discovery.
6. The implementation/review chain records an ephemeral evidence summary; an
   optional local redacted trace is written only when explicitly enabled.

## Inputs

- Optional `ai-profile.yaml` `subagentPolicy` configuration.
- Existing workflow packs, generated skills, client capability matrix, specs,
  issue briefs, `TASKS.md`, `CONTEXT.md`, and project instructions.
- Local executable/index/registration/approval/health observations for CCE.
- Versioned Codex and Claude model/effort mappings.

Proposed additive shape:

```yaml
subagentPolicy:
  enabled: true
  roles:
    implementer: { capability: balanced, effort: medium }
    complex-implementer: { capability: balanced, effort: high }
    explorer: { capability: balanced, effort: low }
    spec-reviewer: { capability: balanced, effort: high }
    quality-reviewer: { capability: balanced, effort: high }
    critical-reviewer: { capability: strongest, effort: high }
    architect: { capability: strongest, effort: extra-high }
    grill: { capability: strongest, effort: high }
    mechanical: { capability: efficient, effort: medium }
  orchestration:
    maxConcurrentThreads: 3
    maxDepth: 1
    parallelWrites: false
  context:
    handoff: task-capsule
    memory: targeted
    indexed:
      mode: preferred
      provider: cce
  evidence:
    summary: required
    localTrace:
      enabled: false
      retention: 20
```

Exact role keys, defaults, validation errors, and target override syntax MUST
be frozen by I1 tests before implementation. The capability vocabulary is
`efficient | balanced | strongest`; effort is
`low | medium | high | extra-high`, with unsupported target values mapped by
documented target rules rather than silently invented.

## Outputs

- Validated canonical execution-policy IR and target-specific Codex/Claude
  guidance or configuration.
- Capability-accurate Tabnine guidance limited to portable task-capsule and
  local-first conventions.
- Normalized indexed-context diagnostic result and human-readable doctor rows.
- Preview or explicit registration repair report.
- Task capsules and metadata-only evidence summaries; optional bounded local
  redacted trace.
- Updated schema, examples, docs, capability research, goldens, and lockfile
  provenance where existing contracts require them.

## Contracts

- Omission or `enabled: false` preserves all existing generated bytes and
  behavior.
- The normalized indexed-context states are a closed set:
  `provider-missing | index-missing | registration-missing |
approval-required | refresh-required | unhealthy | ready`.
- State precedence and target evidence MUST be table-driven so one machine
  condition yields one stable state. Diagnostics are read-only.
- Indexed context is a provider-neutral capability in canonical contracts;
  `cce` is the only supported adapter in this phase (ADR 0015).
- Degraded mode MUST identify the failed state, continue when the task is
  otherwise safe, bound native discovery, and record the fallback in evidence.
- Context precedence is:
  current user and safety instructions > project instructions > approved
  specs/ADRs/briefs > current repository evidence through indexed context >
  targeted memory.
- A task capsule contains objective, authoritative artifact paths, explicit
  contracts/non-goals, seam and mock boundary, validation commands, write
  ownership, and known blockers; it excludes unrelated chat and memory.
- Default orchestration is depth 1, at most 3 concurrent threads, no parallel
  writes, and sequential implementation/spec-review/quality-review.
- Role mappings are capability intent plus effort intent, not timeless model
  names. Exact client mappings are versioned, tested, and overrideable only
  through the approved schema (ADR 0016).
- Setup preview and `--write` return deterministic action/refusal reports.
  Refusal codes are `SETUP-CONTEXT-PRECONDITION`,
  `SETUP-CONTEXT-CONFLICT`, `SETUP-CONTEXT-UNSAFE-EDIT`, and
  `SETUP-CONTEXT-WRITE-FAILED`.
- Setup MUST NOT install CCE, create/refresh an index, approve Claude MCP,
  mutate unrelated MCP entries, or change global configuration silently.
- Evidence may include role, resolved capability/effort, client mapping
  version, capsule fields present, indexed state, fallback reason, tool-call
  counts, subagent/thread counts, validation outcome, and coarse token usage
  when the client exposes it. It MUST NOT include prompts, source snippets,
  retrieved chunks, diffs, tool payloads, secrets, or raw paths requiring
  redaction.
- Local trace is off by default, repository-local, redacted, retention-bounded,
  and never uploaded. Ephemeral summary remains available for the final review.

## Security Rules

- No source-code or secret upload; all indexing and evidence remain local.
- No source, prompt, retrieved chunk, diff, tool payload, token, environment
  value, or credential material in evidence.
- No telemetry or network call from diagnostics, policy resolution, task
  capsule construction, or evidence recording.
- Do not read secret stores to diagnose MCP setup. Report approval state only
  from non-secret client status surfaces.
- Registration repair requires explicit `--write`, conflict/ownership
  preflight, insertion-only or structural safe editing, atomic write behavior,
  and a redacted report.
- Client permission and sandbox controls remain authoritative.

## Acceptance Criteria

1. A profile without enabled `subagentPolicy` produces byte-identical existing
   outputs and lockfile behavior.
2. Schema and semantic validation reject unknown roles, capability/effort
   values, recursive depth above 1, concurrency above 3, parallel writes, an
   unsupported provider, unsafe evidence settings, and malformed overrides
   with stable error codes and redacted messages.
3. Codex and Claude goldens show the approved role matrix, task-capsule
   contract, targeted-memory rule, orchestration bounds, indexed-first flow,
   explicit degraded mode, and evidence contract. Tabnine makes no unsupported
   model/MCP/subagent claim.
4. Client model/effort mappings are backed by dated official evidence, pinned
   as versioned data, and covered by table-driven tests including unsupported
   effort fallback and explicit override behavior.
5. Task-capsule tests prove only authoritative bounded fields are handed off;
   implementation/spec/quality review remains sequential and no subagent can
   delegate below depth 1.
6. Indexed diagnostics cover every normalized state, precedence collision,
   stale index, server failure, absent executable, missing registration, and
   Claude approval-required case without filesystem mutation or network access.
7. Setup preview/`--write` tests cover Codex and Claude ready, add, idempotent,
   conflict, unsafe edit, precondition, rollback/write failure, and refusal-code
   contracts; no path installs/indexes CCE or grants approval.
8. Evidence tests prove the required metadata is sufficient to reconstruct the
   role decision and fallback path while runtime sentinels fail on content,
   secret, telemetry, or unbounded-retention attempts.
9. Adoption/upgrade is explicit and additive; generated docs explain CCE setup,
   indexing, registration, Claude approval, health, degraded mode, and local
   evidence without promising exact savings.

## Tests

- Schema/parser unit tests and invalid-fixture table for every new field and
  stable error contract.
- Model/effort mapping table tests plus per-target golden fixtures.
- Task-capsule unit tests and orchestration integration sentinels.
- Table-driven indexed-state detector tests with filesystem/process/network
  mutation sentinels.
- Setup planner/editor tests: preview, idempotence, conflict, refusal code,
  atomic failure, and unrelated-entry preservation.
- Evidence/redaction/retention tests with forbidden-content runtime sentinels.
- Compile and packaging goldens proving disabled-policy byte identity and
  enabled-policy deterministic output.
- Final spec-to-test matrix for every MUST, acceptance criterion, and error
  contract; static-only evidence is called out as weaker.

## TDD Strategy

I1 is a deterministic generator slice at `compile(profile) -> emitted policy
artifacts`. I2 observes task capsule and orchestration outcomes through the
workflow policy boundary. I3 is a pure normalized-state computation fed by
explicit adapters. I4 observes `setup plan -> report/filesystem effect` with
filesystem writes as the only mockable unmanaged boundary. I5 observes
`execution events -> redacted evidence`. Each issue starts with one focused RED
at its declared seam and implements only the minimum GREEN.

## Issue Plan

See `docs/specs/phase-30/issues/` (I1-I6) and `TASKS.md`. I1 precedes I2 and I3;
I2 and I3 are mutually parallel-safe after I1. I3 precedes I4. I2 precedes I5.
I4 and I5 precede I6. Shared schema, canonical guidance, and golden files may
require serialization even where logical dependencies permit parallel work.

## Documentation Updates

- Root and package README sections for opt-in subagent policy and local CCE.
- Generated Codex/Claude guidance and capability-accurate Tabnine notes.
- CLI reference for doctor/setup preview and `--write`.
- Capability matrix/research note with dated official client evidence.
- Upgrade/adoption docs, schema reference, examples, and security/privacy docs.

## Final Review Checklist

- Build the required spec-to-test matrix and verify every error code.
- Prove disabled-policy byte identity and deterministic enabled outputs.
- Verify client mappings against current official evidence at implementation
  time and record the mapping version.
- Exercise all seven indexed states and collisions with read-only sentinels.
- Prove setup cannot install, index, approve, silently mutate globals, or alter
  unrelated registration entries.
- Prove capsule isolation, depth/thread/write bounds, and sequential reviews.
- Prove evidence contains enough decision/fallback metadata and none of the
  forbidden content classes.
- Run tests, goldens, check/doctor, package verification, and final-review.
- List remaining provider, client-version, and observability risks.
