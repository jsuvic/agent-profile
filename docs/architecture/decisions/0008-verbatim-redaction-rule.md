# ADR 0008: Verbatim Redaction Rule As Fixed Text

## Status

Accepted with phase-25 approval (2026-07-06)

## Context

The phase-25 logging guidance topic includes a redaction rule - what must
never be logged. Generated content is normally free to be reworded during
implementation as long as golden fixtures are updated. A security-core rule
reworded per rendering or per release would drift, and drift in a
never-log rule is a safety regression, not a style change.

## Decision

The redaction rule is a verbatim text fixed by the phase-25 spec approval:

> Never log secrets, tokens, credentials, environment variable values,
> user file contents, or personal or production data. Log by allowlist:
> only values explicitly known to be safe.

The exact string must appear in every rendering of the topic, is asserted
byte-for-byte by tests, and changing it requires a spec change. Enforcement
surfaces reference the rule; they never restate a variant of it.

## Rationale

This mirrors the phase-23 verbatim secret rule for memory guidance, which
established the pattern: safety-core sentences are contracts, not prose.
A single fixed source of truth prevents paraphrase drift across AGENTS.md,
Tabnine, and reviewer templates.

## Consequences

Positive:

- The safety core is testable byte-for-byte and cannot silently weaken.
- One source of truth across all renderings and enforcement references.

Negative:

- Any wording improvement, however small, requires a spec change and
  fixture updates.
