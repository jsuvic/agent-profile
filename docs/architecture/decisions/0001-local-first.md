# ADR 0001: Local-First Operation

## Status

Accepted

## Context

The tool works with repository instructions, generated agent configuration, and
future safety checks. These files may reveal source layout, business logic, and
security assumptions.

## Decision

Agent Profile Compiler is local-first by default.

The MVP must not upload source code, secrets, generated instructions, or scan
results. Hosted scanning, hosted execution, hosted MCP gateways, and credential
brokerage are out of scope.

## Consequences

- The CLI must work without login.
- Init, compile, doctor, and any future diff command must run locally.
- Generated configs must use environment variable references instead of literal
  secret values.
- Any future network feature requires a separate spec, explicit user consent,
  and a security review.
