# ADR 0020: Preserve Valid Future Configuration As User-Owned

## Status

Accepted 2026-07-14 with phase-32/001 approval.

## Context

Agent Profile Compiler currently generates an empty root `.mcp.json` because
the canonical profile does not yet support MCP server declarations. Users may
still configure valid project-local servers directly. The generated-destination
and lockfile rules then classify those bytes as drift, Doctor fails, and
compile proposes replacing the user configuration with the empty generated
baseline.

Two ownership models were considered:

- mixed structural ownership, where the compiler merges its generated JSON
  with custom server entries; and
- whole-file user ownership until a canonical schema can represent the content.

Mixed ownership would silently define MCP merge, conflict, ordering, and
migration semantics before the future MCP declaration spec is approved.

## Decision

When root `.mcp.json` is structurally valid, differs from the exact generated
empty baseline, and contains configuration the canonical profile cannot
represent, classify it as **user-owned future configuration**.

For that state:

- preserve the file byte-for-byte in compile dry-run and write mode;
- record deterministic manual ownership in the lockfile;
- do not emit generated-byte drift for that file;
- emit informational guidance that Agent Profile Compiler does not manage,
  verify, or synchronize the configured servers; and
- require explicit adoption if a later approved schema can represent it.

The exact generated empty baseline remains generated-owned. Malformed JSON,
unsafe filesystem structure, literal-secret violations, and unrelated
destinations keep their existing validation and ownership rules.

## Rationale

Whole-file user ownership is the only current model that preserves user intent
without inventing unsupported merge semantics. Informational guidance is
honest about the management boundary, while deterministic lock ownership keeps
compile and Doctor consistent. Explicit future adoption prevents a later
schema release from silently taking control of an existing user file.

## Consequences

Positive:

- Compile cannot delete valid custom MCP configuration.
- Doctor distinguishes unsupported user intent from corruption.
- No premature MCP schema, merge, launch, installation, or synchronization
  contract is created.
- Future migration has an explicit consent boundary.

Negative:

- Agent Profile Compiler cannot guarantee or synchronize those MCP servers.
- The root destination may be user-owned even though the compiler has a
  generated empty target for other repositories.
- Future MCP support must implement a deliberate ownership-adoption flow.
