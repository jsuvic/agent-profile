# Spec: Diff Before Write

## Status

Verified

Approved for Phase 5 implementation on 2026-05-02. Implemented on
2026-05-03. Verified on 2026-05-03 with workspace checks, tests, and build.

## Problem

Phase 5 introduces file writes. Users must be able to review what will change
before generated files replace existing project files.

## Goal

Create a shared diff-before-write helper used by `compile` and `init`.

## Non-Goals

- interactive terminal UI
- applying patch hunks selectively
- external diff tools
- writing files outside compiler-declared paths

## User Flow

1. A command prepares one or more planned writes.
2. The helper compares current bytes with proposed bytes.
3. Dry-run reports create/change/unchanged/delete-none actions.
4. Write mode writes only planned create/change files.

## Inputs

- root directory
- planned write descriptors
- existing file bytes for planned paths

## Outputs

- deterministic write plan
- optional file writes
- write result report

```ts
type WritePlanResult = {
  actions: Array<{
    path: string;
    action: "create" | "change" | "unchanged";
    plannedBytes: number;
  }>;
  counts: {
    create: number;
    change: number;
    unchanged: number;
  };
};
```

Callers map non-zero create/change counts to user-visible reports and CLI exit
codes according to each command spec.

## Contracts

- Paths must pass compiler `safeOutputPath`.
- Dry-run must never write.
- Write mode must create parent directories as needed.
- Existing file contents must not be printed by default.
- Dry-run reports only path, action, and planned byte count. It must not print
  before/after contents, existing byte counts, or hashes by default.
- Planned writes are sorted by path.
- Writes are byte-for-byte exact.
- The helper is best-effort and does not provide atomic multi-file writes.
  Concurrent edits during write are outside MVP guarantees.
- The helper does not close every time-of-check/time-of-use race. If a symlink
  is created after containment validation and before the final write, behavior
  is outside the MVP threat model and must be revisited before high-assurance
  writes are claimed.
- Before writing, the helper must reject any planned path whose resolved real
  parent directory or existing target path escapes the root. Symlink targets
  that resolve outside the root are rejected.
- All planned paths must round-trip through `safeOutputPath` from
  `packages/compiler/src/shared.ts`.

## Security Rules

- Do not read secret files.
- Do not write outside safe repository-relative paths.
- Do not print file contents by default.
- Do not delete files.
- Do not chmod or change ownership.
- Do not follow symlink escapes outside the repository root.

## Acceptance Criteria

- unchanged files are detected by byte equality
- changed files are detected by byte inequality
- missing files are reported as creates
- dry-run writes nothing
- write mode writes exact bytes
- unsafe paths are rejected
- symlink escape paths are rejected
- parent directories are created for safe create actions

## Tests

- create plan for missing file
- change plan for differing file
- unchanged plan for equal bytes
- dry-run no mutation
- write creates parent directories
- unsafe path rejection
- symlink escape rejection
- create plan when target parent does not exist
- deterministic plan ordering

## Documentation Updates

- future CLI command reference
- `docs/security/trust-model.md`

## Final Review Checklist

- all writes are explicit
- paths are safe
- no deletions occur
- output avoids file-content leakage
