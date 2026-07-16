# Spec: Guided Repository Update

## Status

Approved 2026-07-14 from the repository-update field-test agreement. Sequenced
after Phase 31.5 Model Selection Lifecycle I9, which is itself sequenced after
the completed Phase 31 Permission Posture Lifecycle.

## Problem

A user running interactive `agent-profile` to update an existing repository can
choose to adopt capabilities, receive a list of opaque unsafe-insertion
refusals, see Doctor classify a valid custom `.mcp.json` as generated drift,
and finish with a compile preview that writes nothing and does not explain that
the proposed 23-byte output would remove the custom MCP server.

Three different ownership decisions are currently collapsed into one confusing
journey:

1. capability adoption is treated as a bulk yes/no choice without explaining
   each value or allowing an informed editable review;
2. valid configuration for a future product capability is treated as corrupt
   generated output even though the current schema cannot represent it; and
3. conservative insertion refusal does not distinguish genuinely unsafe YAML
   from an ordinary supported block mapping.

## Goal

An existing-repository update preserves valid user intent, explains each
proposed capability change, allows the user to edit the selection, previews
every affected artifact, and applies nothing without a separate explicit
confirmation.

## Intent

Agent Profile Compiler guides rather than forces. User ownership prevents
destructive rewriting, but does not create unsupported synchronization claims;
interactive convenience improves informed consent without weakening scripted
or safety contracts.

## Decision Rules

1. User-owned valid bytes before generated defaults: configuration the current
   schema cannot represent is preserved, not normalized away.
2. Explain before selecting: every capability exposes outcome, value, affected
   clients, generated artifacts, and material tradeoffs before final consent.
3. Preselection before acceptance: Adopt all is a shortcut into review, never a
   final write decision.
4. Exact refusal before generic refusal: safe supported mappings are edited;
   genuinely unsafe syntax names the structural reason and exact manual path.
5. Existing commands before parallel machinery: reuse catalog, insertion,
   ownership, compile-plan, Doctor, and dispatcher seams.
6. Future support before implicit migration: a later MCP declaration schema
   must offer explicit adoption of user-owned configuration.

## Architecture Rescue Candidate

### Future-configuration ownership decision

- Files/modules involved: import-report ownership classification, compile drift
  reconciliation, lockfile output descriptors, Doctor lock/ownership checks,
  and root `.mcp.json` planning.
- Current friction: byte drift at a generated destination is interpreted as
  corruption before asking whether the current schema can represent the valid
  user content.
- Proposed interface: one immutable `FutureConfigurationOwnershipDecision`
  produced from destination, parsed shape, generated baseline, lock ownership,
  and canonical representability. It returns generated-owned,
  user-owned-future-configuration, or invalid with a stable reason.
- Locality/leverage: compile, Doctor, import, and reconciliation consume the
  same decision instead of assigning different meanings to identical bytes.
- Test improvement: a pure table freezes valid custom, generated baseline,
  malformed, unsupported-path, and future-adoption boundaries before any
  filesystem orchestration changes.
- ADR/spec conflicts: narrows the generated-destination assumption in ADR 0011
  without changing mixed-region ownership; governed by ADR 0020.
- Dependency state: Phase 32 prerequisite; can start after Phase 31.5 I9.

## Non-Goals

- Adding an MCP declaration schema or generating configured MCP servers.
- Merging generated and custom JSON structurally.
- Synchronizing custom MCP configuration across clients.
- Treating malformed JSON or unsafe filesystem structure as valid.
- Moving permission selection into upgrade; Phase 31 `configure` owns posture.
- Changing non-interactive upgrade text, JSON/quiet shapes, exit codes, or the
  `--adopt-recommended` spelling.
- Re-rendering `ai-profile.yaml`, removing existing values, or weakening the
  insertion-only ownership rule.
- Auto-running compile or any mutating follow-up.

## User Flow

### Existing custom MCP configuration

When root `.mcp.json` is valid and contains user-added server configuration that
the canonical profile cannot represent, the update journey states:

- the file is user-owned future configuration;
- compile will preserve it byte-for-byte;
- Agent Profile Compiler does not manage or synchronize those servers; and
- a future supported schema will require explicit adoption.

This condition is informational and does not make Doctor fail. Malformed JSON,
unsafe paths, or secret-like literal values continue through their existing
validation and safety contracts.

### Capability adoption

`Keep current` exits without change. `Adopt all available` preselects every
offered capability. `Customize` begins with the current selection. Both adopt
paths enter the same editable review.

For every offered capability, the review shows:

- current and proposed value;
- consequence of enabled and disabled values;
- affected enabled clients and explicit non-effects;
- generated artifact families or workflow behavior changed;
- prerequisites, limitations, or material tradeoffs.

The user may change the selection, cancel, or continue to an exact
`ai-profile.yaml` insertion preview. A separate confirmation, default No,
applies the profile changes atomically. When `ai-profile.lock` exists, the
profile and existing lockfile update atomically under the Phase 27 provenance
contract. When it is absent, upgrade inserts only the profile changes, does not
create or stamp a lockfile, and reports the existing deferred-stamp note.
Decline preserves all bytes. Compilation remains a separately confirmed next
action.

### Unsafe insertion

Ordinary block-style mappings, including an existing `workflow` mapping and
nested `capabilities.delegation.subagents` mapping, accept supported targeted
insertions. Anchors, aliases, flow-style targets, multi-document boundaries,
missing ranges, or other unproven structures are refused with the exact target
path, structural reason, and manual value.

## Inputs

- `ai-profile.yaml` source bytes and parsed source layout.
- Capability catalog entries plus versioned user-facing impact metadata.
- Existing root `.mcp.json` bytes and parsed structural classification.
- `ai-profile.lock` ownership and hashes.
- Generated baseline outputs and compile plan.
- Interactive strategy, per-capability edits, preview confirmation, and
  dispatcher follow-up confirmation.

## Outputs

- Immutable future-configuration ownership decision.
- User-owned lockfile descriptor for valid custom root `.mcp.json`.
- Informational Doctor/update guidance with no generated-drift failure.
- Editable capability review model and interactive presentation.
- Comment-preserving insertion plan or exact refusal record.
- Atomic profile write report, plus an atomic existing-lock update report only
  when `ai-profile.lock` already exists, followed by the existing separately
  consented compile offer.

## Contracts

- Valid user-owned future configuration is preserved byte-for-byte by dry-run
  and write-mode compile.
- The compiler never claims to manage, validate runtime readiness, or
  synchronize custom MCP servers.
- The exact generated empty `.mcp.json` baseline remains generated-owned.
- Malformed JSON does not become user-owned merely because it differs.
- Lockfile migration is deterministic and idempotent; the second compile has no
  ownership churn.
- Insertion-only profile editing and comment/format preservation remain binding.
- Adopt all and Customize share one review and confirmation path.
- Interactive adopt-all is preselection, not acceptance.
- Direct scripted `--write --adopt-recommended` remains the explicit fast path
  and preserves its behavior and spelling.
- Non-interactive upgrade text, JSON/quiet shapes, exit codes, non-TTY bare
  help, and unrelated generated fixtures remain byte-identical.
- Compile remains a separate mutation with a separate confirmation.

## Security Rules

- Do not read MCP environment values, credentials, tokens, or invoked-server
  output. Structural classification reads only required JSON keys and types.
- Do not launch, install, connect to, or verify MCP servers.
- Do not copy custom MCP configuration to another client or user scope.
- Do not overwrite, normalize, or reserialize user-owned future configuration.
- Reject symlinks, unsafe paths, malformed structures, and literal secret
  introduction under existing safety contracts.
- No network, telemetry, hosted execution, dependency installation, or source
  upload.
- Every interactive mutation keeps preview, cancel, and explicit confirmation.

## Acceptance Criteria

1. A pure ownership table classifies exact generated empty root `.mcp.json` as
   generated-owned, valid non-empty unrepresentable root `.mcp.json` as
   user-owned future configuration, malformed JSON as invalid, and unrelated
   destinations under their existing ownership rules.
2. Compile dry-run and write preserve valid user-owned root `.mcp.json`
   byte-for-byte, migrate its lock descriptor deterministically, and become
   idempotent on the next run.
3. Doctor reports valid user-owned future MCP configuration as info with
   management/synchronization limits and does not emit generated-byte drift for
   that file; malformed content still follows error contracts.
4. Capability impact metadata is versioned, deterministic, complete for every
   offered catalog entry, and states current/proposed values, enabled/disabled
   consequences, clients, artifact families, prerequisites, and tradeoffs.
5. Interactive Adopt all preselects every offered capability and then opens the
   editable review; Customize opens the same review without bypassing it.
6. The user can change selections, cancel with byte identity, preview exact
   insertions, decline the write, or confirm one atomic profile write. An
   existing lockfile participates in that atomic write; an absent lockfile
   remains absent and receives no catalog-version stamp, per Phase 27.
7. Existing ordinary block-style repository YAML accepts the field-log
   workflow, skills-pack, and reviewer-subagent-pack insertions without generic
   unsafe-target refusals.
8. Every genuine insertion refusal reports capability, canonical target path,
   structural reason, and exact manual value without re-rendering the profile.
9. After a successful interactive profile write, compile is only offered as a
   separate default-No confirmation; no path auto-runs it.
10. Frozen scripted/non-interactive surfaces and unrelated generated fixtures
    remain byte-identical, and the published package includes all required
    review metadata/runtime modules.

## Tests

- Table-driven future-configuration ownership tests with exact empty, valid
  custom, malformed, symlink/unsafe, and unrelated-destination rows.
- Compile/lock/Doctor integration fixture containing a valid custom
  `context-engine` server without reading or printing its arguments or values.
- Byte sentinel proving dry-run/write preservation and second-run idempotence.
- Capability metadata completeness and deterministic ordering tables.
- Interactive prompt tests for adopt-all preselection, editable changes,
  Customize parity, cancel, decline, confirm, and separate compile consent.
- Field-log YAML regression covering all offered workflow flags, skills packs,
  and reviewer-subagent pack in one insertion plan.
- Table-driven refusal tests for anchors, aliases, flow mappings,
  multi-document boundaries, and missing ranges.
- Frozen non-interactive/JSON/quiet/help/golden regressions.
- Runtime sentinels for no MCP launch, network, secret/environment read,
  dependency installation, telemetry, hosted execution, or source upload.

## TDD Strategy

I1 freezes the pure ownership decision. I2 proves preservation at the
compile/lock/Doctor boundary. I3 freezes the pure capability-impact review
model. I4 proves the existing insertion seam accepts supported YAML and still
refuses genuinely unsafe structures. I5 drives the interactive review and
atomic apply orchestration. I6 closes the packaged end-to-end journey and
frozen contracts. One issue equals one seam, one observable outcome, and one
focused RED/GREEN cycle.

## Issue Plan

See `docs/specs/phase-32/issues/` and `TASKS.md`.

- I1 and I3 are parallel-safe after Phase 31.5 I9; I1 is the ownership
  architecture prerequisite for I2.
- I4 is parallel-safe with I1/I3 after Phase 31.5 and owns only the insertion
  regression seam.
- I2 depends on I1.
- I5 depends on I3 and I4.
- I6 depends on I2 and I5.

## Documentation Updates

- Phase 31 permission-source field-evidence amendment.
- Root/package README repository-update journey.
- CLI upgrade, compile, Doctor, and ownership documentation.
- MCP limitation/future-adoption guidance.
- ADR 0009 interactive-review amendment and ADR 0020 ownership decision.
- CHANGELOG and published-package notes.

## Final Review Checklist

- Build a spec-to-test matrix for acceptance criteria 1-10, every MUST, every
  refusal reason, and every error/info contract.
- Prove custom MCP bytes are never printed, reserialized, launched, uploaded,
  synchronized, or overwritten.
- Prove exact generated empty MCP behavior and unrelated ownership behavior do
  not change.
- Prove all capability metadata is complete and catalog-derived rather than
  presentation-local.
- Prove adopt-all cannot reach a write without editable review and a fresh
  confirmation.
- Prove cancel/decline byte identity, profile/existing-lock atomicity, and the
  no-lockfile insertion-only exception.
- Prove ordinary supported YAML succeeds and unsafe syntax retains exact
  conservative refusal.
- Prove frozen non-interactive, JSON, quiet, help, exit-code, golden, and pack
  contracts.
- Run focused tests, full tests sequentially, goldens, check, lint, Doctor,
  verify:pack, package dry-run, and final-review.
- Record remaining future MCP schema, client-version, and ownership-migration
  risks.
