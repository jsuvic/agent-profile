# Phase 8 Spec Map

## Status

Implemented. Phase 8 is local editable UI for an existing `ai-profile.yaml`.
The guarded editing flow (plan/apply endpoints, CSRF, stale-etag detection,
diff-before-write, secret-like rejection) is part of the re-rooted initial
import `167f313` (2026-05-12) and is exercised by the web workspace tests. The
editor was extended on 2026-07-03 in PR #49 to preserve the `capabilities`
block on saves.

## Purpose

Phase 8 changes the Phase 6 profile route from read-only inspection to guarded
local editing. The browser may prepare profile edits, but the server remains
the trust boundary for validation, diff generation, stale-file detection, path
containment, and final write.

The phase intentionally keeps browser writes narrow:

- only `ai-profile.yaml`
- only schema v1 fields
- only local loopback UI requests
- only after explicit diff review and confirmation

Generated target files, lockfiles, imports, stack detection, and initialization
remain CLI-owned unless a later spec changes that contract.

## Review Order

1. `001-profile-form-editing.md`
2. `004-profile-validation-feedback.md`
3. `002-ui-diff-before-write.md`
4. `003-local-write-safety.md`

The form and validation contracts define what a candidate profile is. The diff
and write-safety specs define when that candidate can touch disk.

## Implementation Companion

`000-detailed-implementation.md` is the implementation-level synthesis for the
four feature specs. It pins the profile API endpoints, response envelopes,
ETag/stale-edit flow, plan-token model, and test matrix. If it conflicts with a
feature spec, update the feature spec first and then bring the synthesis doc
back into alignment.

## Implementation Gate

Phase 8 implementation must not start until these conditions are true:

- specs `001` through `004` are approved
- Phase 5 diff-before-write and write-safety contracts have been reviewed
  against the browser save path
- Phase 6 profile route contracts have been amended from read-only to
  guarded-editable without changing the safety posture of Artifacts, Doctor,
  Targets, Settings, Dashboard, or Landing
- the web package has focused tests for profile draft construction,
  validation mapping, stale-file detection, and write containment

## Verification Gate

Phase 8 verification requires:

- profile edits are local-only and never trigger outbound network requests
- every profile write is diff-gated and explicitly confirmed
- schema validation and secret-like literal checks block invalid writes
- stale on-disk profile bytes block both preview and confirmed write
- no endpoint accepts an arbitrary write path
- symlink escape and traversal attempts are rejected in tests
- generated artifacts and `ai-profile.lock` remain untouched by the UI save path
- docs are updated to explain that the UI can edit the source profile but still
  does not write generated target files

## Out Of Scope

- creating a missing profile; users still run `agent-profile init --write`
- importing existing agent files
- writing generated artifacts or `ai-profile.lock`
- editing raw YAML in a browser text editor
- preserving comments, anchors, aliases, or custom YAML formatting as a hard
  requirement
- editing unknown schema fields
- installing dependencies, running shell commands, or launching MCP servers
- account, sync, collaboration, telemetry, hosted execution, or source upload

## Cross-Phase Contracts

- Phase 5 still owns generated artifact writes and first-write protection.
- Phase 6 Artifacts and Doctor routes remain read-only.
- Phase 7 marketing/live route separation still applies: marketing routes must
  not use live edit APIs or imply project writes.
- Phase later specs for hooks, subagents, plugins, hosted MCP gateways, and
  team policy packs remain out of Phase 8 scope.
