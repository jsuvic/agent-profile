# Changelog

All notable changes to Agent Profile Compiler will be documented in this file.

## Unreleased

- Improve interactive first-contact guidance: the bare dispatcher now offers
  one consent-gated next action after each completed routed command, doctor
  groups repeated actionable findings into recommendations, the upgrade menu
  explains its keep/adopt-all/customize choices, and the dispatcher starts
  with a neutral agent-profile wordmark. Interactive fixture differences are
  limited to those new follow-up prompts, doctor recommendation lines, upgrade
  labels/hints/note, and the neutral dispatcher wordmark; non-interactive
  doctor and upgrade output and JSON remain unchanged.

## 0.4.4 — 2026-07-12

- Route interactive bare `agent-profile` invocations through a read-only
  repository-state menu while preserving byte-identical non-TTY help and all
  explicit subcommand contracts.

## 0.4.3 — 2026-07-11

- Add Phase 29 I1 Tabnine workflow skills (implementing
  `docs/specs/phase-29/001-tabnine-workflow-skills.md`; ADR 0013). The shared
  `.agents/skills/` emission condition extends from "Codex enabled" to "Codex or
  Tabnine enabled", so Tabnine-only setups now emit the instruction-only
  workflow skills (`grill-change`, `request-to-spec-issues`, `sdd-change`,
  `tdd-change`, `final-review`), the selected review, specialist,
  `mcp-fit-check`, and phase-22 loop skills to the shared convention Tabnine CLI
  discovers - one file per skill, guidelines unchanged. Delegation-dependent
  skills (`subagent-driven-change`, `implement-next`) still require a
  delegation-capable client (Claude or Codex); a Tabnine-only setup omits them
  and gets an informational compile note. A single caveat note reports that
  Agent Skills discovery requires a current Tabnine CLI generation. Enabling
  Tabnine alongside Codex changes no existing `.agents/skills/` byte
  (golden-proven); nothing is written under `.tabnine/agent/` and Tabnine
  `settings.json` is never touched. ADR 0007 gains a dated note that its
  "skills reach only Claude/Codex" premise is outdated; its logging-topic
  decision is unchanged and is not superseded.

- Correct Phase 27 command-flow guidance: init now names the ordered
  `compile --write` then `upgrade` path; compile dry-run explicitly says that
  nothing was written; compile and upgrade follow-up guidance names
  `compile --write`; upgrade can report and apply profile-only capability
  seeding without a lockfile while deferring the catalog stamp; empty import
  scans skip the strategy question with the preserve default; capability
  choices identify Claude/Codex-only output and Tabnine-only plans call out
  selected packs with no artifacts; write-mode import results use the heading
  `Files report (state after write)`.

## 0.4.2 — 2026-07-10

- Add Phase 27 I4 interactive drift reconciliation to `compile` (implementing
  `docs/specs/phase-27/003-drift-reconciliation.md`). At the point compile would
  refuse a hash-mismatched lockfile-owned file, an interactive TTY now shows the
  per-file drift diff (deterministically regenerated canonical bytes vs on-disk)
  and a classification menu. Root instruction files (`AGENTS.md`, `CLAUDE.md`)
  get a four-way menu — shared intent (relocate the user's lines into the
  `AGENTS.md` manual region, restoring the generated region to canonical; the
  Tabnine gap is stated inline), client-specific (relocate into the drifted
  file's own manual region), accidental (restore canonical + refresh hash), and
  cancel (default). All other drifted generated outputs get keep (reclassify
  `manual-owned`) / restore-canonical / cancel. Interleaved edits that cannot be
  cleanly separated from canonical bytes refuse relocation and reduce to
  keep/restore/cancel. Every outcome maps only to existing `mixed` /
  `manual-owned` / rehash transitions, routes through the existing region-aware
  planner and a single atomic write, and relocated user lines are byte-preserved.
  Cancel at any prompt writes nothing and prints the standard refusal.
  Non-interactive compile, `--json`, exit codes, and `--force` are byte-identical
  and never evaluate clack (lazy-imported behind the interactive gate).

- Add Phase 27 I3 `agent-profile upgrade`: catalog-version-aware reporting,
  interactive keep/adopt/customize choices with preview-only defaults, and the
  explicit `--write --adopt-recommended` scripted mutation path. Profile edits
  are insertion-only and byte-preserving through YAML Document offsets;
  flow-style, anchored, or malformed targets fail closed with exact manual
  lines and no partial write. Successful writes stamp the integer catalog
  revision and point to (but never chain) `agent-profile compile`. Existing
  interactive init now points to upgrade; non-interactive init remains
  byte-identical. Clack remains lazy behind the interactive gate.

- Add Phase 26 WS2-I1 static presentation for `compile`, `doctor`, `ui`, and
  the init write phase (implementing `docs/specs/phase-26/001-clack-cli-presentation.md`,
  issue `003-static-presentation.md`). On the interactive TTY only: `compile`
  gains the wordmark logo, a compile spinner, a colored `+`/`~`/`=` write
  plan, a `--write` progress bar, and a `log.success` file-count summary;
  `doctor` gains the logo, a timer spinner, color-tinted `[error]`/`[warning]`/
  `[info]` severities, a green `No issues found.`, and a one-line count
  summary; `ui` gains the logo, a task log over the already-spawned server's
  stdout (cleared on port bind, retained on non-zero exit), and the
  url/root/posture block as a `note`; the init write phase renders as named
  steps (create profile, generate client files, update .gitignore). Color is
  applied via `node:util` `styleText` through the pure `branding.ts` helpers
  (no color dependency); every clack call is dynamically imported behind the
  interactive-TTY gate, so non-interactive, `--json`, `--quiet`, piped, and
  generated-file surfaces stay byte-identical and never evaluate clack. The
  named write steps use a spinner-based runner rather than clack `tasks()`,
  which leaks its frame timer and blocks stdin when a step throws.

- Fix 0.4.1 import-report ownership conformance: root instruction files now
  honor lockfile v1/v2 ownership before marker inspection, report generated
  drift consistently with compile, refuse damaged mixed ownership, and never
  offer regions adoption for lockfile-owned files (Phase 27/001).

## 0.4.0 — 2026-07-07

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
