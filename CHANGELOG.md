# Changelog

All notable changes to Agent Profile Compiler will be documented in this file.

## Unreleased

- Add Phase 21 advisory hooks (WS5 slice 1, implementing
  `docs/specs/phase-21/001-advisory-hooks.md`): a neutral `capabilities.hooks`
  intent with a closed advisory role enum (`final-review-reminder`,
  `context-injection`, `pre-compact-checkpoint`), off by default. Selected
  roles emit pinned, read-only, non-project commands into the generated
  `.claude/settings.json` hooks surface and a generated project-local
  `.codex/hooks.json` (with the documented `commandWindows` Windows override
  pinned per handler). Claude commands are single literals that parse and
  fail open in every documented Claude hook shell (sh, Git Bash, Windows
  PowerShell fallback). Codex reminder handlers emit the documented
  `{"systemMessage": ...}` JSON payload because Codex `Stop`/`SubagentStop`
  require JSON stdout and `PreCompact` ignores plain stdout; the doctor
  inline-hooks check ignores the documented `[features]` `hooks = false`
  feature flag. Tabnine hook generation stays disabled with an
  explicit compile note (support unknown). Both per-target event lists were
  re-verified against the official hooks docs on 2026-07-04. Doctor gains
  non-executing structural checks `LINT-HOOK-003` (event outside the
  verified per-target list), `LINT-HOOK-005` (hook surface where APC does
  not generate hooks, e.g. inline `[hooks]` in the generated config.toml),
  and `LINT-HOOK-008` (artifact handler differs from the pinned template).
  The init wizard gains an optional `Advisory hooks` capability checkbox.
  APC never executes hooks at compile, validation, or doctor time.
- Add conservative Flutter/Dart stack detection from root `pubspec.yaml`
  (Phase 12, implementing
  `docs/specs/phase-later/018-flutter-dart-stack-detection.md`). Detects
  Dart, Flutter, Riverpod, go_router, Drift, Firebase (metadata-only), Rive,
  Lottie, dotLottie, `flutter_test`, and `pub`. Reads only dependency key
  names from the existing root metadata allowlist plus `pubspec.yaml`; never
  reads `pubspec.lock`, `.dart_tool`, `.env`, source files, assets, or
  Firebase config.
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
