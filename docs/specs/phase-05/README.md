# Phase 5 Spec Map

## Status

Verified map for specs `001` through `005`. The standalone CLI diff command is
deferred to `docs/specs/phase-later/004-cli-diff-command.md` by ADR 0006.

## Purpose

Phase 5 introduces the first write-capable flows. Implementation must not start
until the relevant specs are approved.

This phase intentionally moves init, import, and stack detection from the older
research backlog into Phase 5 so write-capable CLI flows can be reviewed
together.

## Review Order

1. `001-cli-compile-dry-run-and-write.md`
2. `003-diff-before-write.md`
3. `002-cli-init.md`
4. `004-stack-detection.md`
5. `005-import-existing-artifacts.md`

The standalone CLI diff command is not a blocker for Phase 5 compile/init
implementation because `003-diff-before-write.md` covers the internal diff
safety helper. A later `doctor --diff` mode must amend the doctor command spec
and JSON output contract before implementation.

Advanced capability generation for hooks, subagents, plugins, global memory
writes, and dedicated knowledge MCP/tools is outside Phase 5. Phase 5 commands
may report unsupported or not-generated capability requests, but they must not
emit those artifacts without later target-specific specs.

## Implementation Gate

Phase 5 verification:

- specs `001` through `005` are verified
- dry-run is the default for write-capable commands
- diff-before-write gates every file mutation
- scans are local and allowlisted
- workspace checks, tests, and build pass as of 2026-05-03
