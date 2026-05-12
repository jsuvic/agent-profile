# Changelog

All notable changes to Agent Profile Compiler will be documented in this file.

## Unreleased

- Bootstrap local-first SDD repository, schema validation, deterministic
  compiler foundation, target outputs, lockfile generation, golden tests, and
  doctor/CLI checks.
- Docs/spec consistency cleanup after the latest research review:
  - Codex skill path corrected from legacy `.codex/skills/` to
    `.agents/skills/` in `docs/architecture/overview.md` (specs and doctor
    already used `.agents/skills/`).
  - Root `CLAUDE.md` realigned as a thin Claude-specific wrapper that points
    to and imports `AGENTS.md` instead of duplicating shared rules.
  - MVP MCP posture added to `docs/architecture/decisions/0005-client-capability-model.md`
    and `docs/architecture/overview.md`: local/config-only generation, STDIO
    as the safest default where supported (not as the only forever-supported
    transport), and remote/hosted/registry-installed MCP as later
    explicit-opt-in capabilities.
  - MCP prompt-injection and tool-poisoning risk framing added to
    `docs/security/trust-model.md` with explicit can/cannot boundaries.
  - No runtime code, schema implementation, fixtures, or generated golden
    files were changed.
