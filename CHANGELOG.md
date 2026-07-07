# Changelog

All notable changes to Agent Profile Compiler will be documented in this file.

## Unreleased

- Fix 0.4.1 import-report ownership conformance: root instruction files now
  honor lockfile v1/v2 ownership before marker inspection, report generated
  drift consistently with compile, refuse damaged mixed ownership, and never
  offer regions adoption for lockfile-owned files (Phase 27/001).
- Add Phase 26 WS1-I2 interactive CLI presentation (implementing
  `docs/specs/phase-26/001-clack-cli-presentation.md`, issue
  `002-logo-framing-style.md`): a pure `formatLogo(command, version, unicode)`
  in `apps/cli/src/branding.ts` — terminal color is applied separately against
  the actual output stream — with a two-line half-block "APC" logotype and the
  "one profile, three agents" tagline for `init`, a single-line glyph wordmark
  for repeat-run commands, and a documented ASCII fallback (`*`, `-`
  separators) when unicode is unsupported. The interactive `init` wizard now
  frames the run with a logo, `intro`/`outro`, the detected-stack summary and
  recommendation as a clack `note`, and the write plan as a `note` whose action
  lines are colored `+`/`~`/`=` via `node:util` `styleText` (no color
  dependency); recommendation warnings surface via `log.warn`. Interactive
  question wording was aligned to the message style guide (sentence case,
  verb-first, no exclamation marks). Color, the logo, and all framing appear
  only on the interactive TTY: `NO_COLOR` and non-TTY streams strip color, and
  non-interactive, `--json`, `--quiet`, and generated-file surfaces stay
  byte-identical.
- Add Phase 25 logging guidance (implementing
  `docs/specs/phase-25/001-logging-guidance.md`): a stack-agnostic logging
  convention gated by a new additive `workflow.loggingGuidance` boolean (off by
  default), following the existing guidance-topic pattern. When enabled, compile
  emits a `## Logging Guidance` section into `AGENTS.md` (inherited by
  `CLAUDE.md`) and a `.tabnine/guidelines/86-logging-guidance.md` guideline
  carrying six binding elements — debug/observability split with
  removal-before-done, project-convention precedence with an ADR-candidate
  fallback, stable event codes on new error paths, the verbatim redaction rule
  fixed by ADR 0008 ("Never log secrets, tokens, credentials, environment
  variable values, user file contents, or personal or production data. Log by
  allowlist: only values explicitly known to be safe."), channel separation
  (stderr vs stdout), and test coverage for support-relied logs — plus the
  explicit priority order redaction > convention > codes. The flag also injects
  enforcement lines at emission time into the Codex/Claude `implementer` and
  `code-quality-reviewer` subagent prompts (leftover debug output downgrades
  `DONE` to `DONE_WITH_CONCERNS`) and one checklist item into the
  `final-review` skill; Tabnine is documentation-only (ADR 0007), and
  `spec-reviewer` / `tdd-change` stay byte-identical. Enforcement text
  references the convention and never restates the redaction rule (single
  source of truth). Flag off or absent keeps compile output byte-identical to
  baseline. Adds byte-stable `logging-guidance-enabled` and
  `logging-enforcement-enabled` golden fixtures and the `logging guidance`
  checkbox to the web profile editor. Document-and-instruction only; no
  application code, telemetry, or log-shipping guidance is generated.
- Add Phase 23 memory guidance (WS7, implementing
  `docs/specs/phase-23/001-memory-guidance.md`): a document-only memory guidance
  topic gated by a new additive `workflow.memoryGuidance` boolean (off by
  default), following the existing guidance-topic pattern
  (`workflow.codeReview` / `refactoring` / `documentation`). When enabled,
  compile emits a `## Memory Guidance` section into `AGENTS.md` (inherited by
  `CLAUDE.md` through the normal import) and a
  `.tabnine/guidelines/85-memory-guidance.md` guideline. Every rendering carries
  the verbatim rule "Never store secrets, tokens, credentials, private keys,
  production access, personal/customer data, or one-time debugging context in
  memory.", documents where each enabled client persists durable instructions
  (Claude `CLAUDE.md`/auto-memory, Codex `AGENTS.md`/Memories, Tabnine
  guidelines with its memory contract explicitly marked unverified), and states
  that memory is for durable decisions rather than volatile session state. v1
  documents memory; it generates no memory content file (`MEMORY.md`, remembered
  facts), no memory directory, and no memory behavior setting. Flag off or absent
  keeps compile output byte-identical to baseline. Adds a byte-stable
  `memory-guidance-enabled` golden fixture and the `memory guidance` checkbox to
  the web profile editor.
- Add Phase 22 automation loop skills (WS6, implementing
  `docs/specs/phase-22/001-automation-loop-skills.md`): the `automation` skill
  pack reserved by Phase 12 now generates five instruction-only loop skills
  (`loop-implement-test-fix`, `loop-review-patch-retest`,
  `loop-security-patch-retest`, `loop-docs-update`, `loop-sdd-cycle`) for
  Claude (`.claude/skills/<name>/SKILL.md`) and Codex
  (`.agents/skills/<name>/SKILL.md`). Every loop skill body carries three
  binding, structurally-checkable sections — `## Max Iterations` (hard-coded
  bound of 3), `## Stop Conditions` (green / no diff / same failure twice), and
  `## Approval Gate` (human approval before any write or destructive step) — so
  the bound, stop conditions, and gate live in the generated text rather than
  the agent's discretion. Cross-references to other generated skills
  (`sdd-change`, `tdd-change`, `final-review`, `review-change`,
  `security-review`) appear only when the referenced skill is generated for the
  same target; otherwise the step is inlined, so no pack combination produces a
  dangling reference. Tabnine gets no loop artifacts plus an explicit
  informational compile note (`automation_target_not_generated`). Doctor gains
  the non-executing structural check `LINT-SKILL-LOOP-001`, which verifies the
  three required sections are present, non-empty, and (for `## Max Iterations`)
  contain a hard-coded integer bound. The init wizard gains an optional
  `Automation loop skills` capability checkbox. APC emits text only and gains
  no execution, launch, scheduling, or iteration path.
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
