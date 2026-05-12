# Research: Actionable Summary

## Summary

The product should be a local-first AI Agent Profile Compiler, not a simple rule
file generator.

The strongest MVP wedge is:

- one canonical `ai-profile.yaml`
- deterministic generated agent files
- lockfile-backed drift detection
- safety checks for permissions and secrets
- first-class support for Tabnine, Codex, and Claude

## Product Direction

Agent Profile Compiler should behave like Terraform-style configuration for AI
coding agents:

- one source of truth
- deterministic compilation
- explicit generated artifacts
- local validation
- drift reporting

## MVP Bias

Prefer:

- local CLI
- npm workspace monorepo
- TypeScript
- JSON Schema contracts
- golden tests
- doctor checks

Avoid for MVP:

- hosted MCP gateway
- hosted source scanning
- credential brokerage
- custom sandbox runtime
- enterprise RBAC
- telemetry by default

## Immediate Actions

- Keep Phase 0 docs and agent instructions strict.
- Add Phase 0.5 research rules before expanding implementation.
- Define all Phase 1 specs before lockfile/compiler/target work.
- Treat existing schema validation as grandfathered Phase 1 work.
- Do not continue Phase 1 coding until lockfile, determinism, AGENTS.md target,
  and golden harness specs exist.
