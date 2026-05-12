# Phase 6 Spec Map

## Status

Approved. Approved scope is local read-only UI for an existing profile and
generated artifacts. No write-capable flows in Phase 6 — writes remain a CLI
responsibility (see Phase 5 specs).

## Purpose

Phase 6 introduces a local-first SvelteKit UI that exposes the existing
compiler and doctor surfaces to humans without changing the underlying
contracts. The UI is a viewer over the same `compileProfile` and `runDoctor`
APIs the CLI already calls. It does not run network requests, does not write
files, and does not introduce new MVP behavior.

The UI design source of truth lives in
`docs/design/phase-06/handoff/` (the design hand-off bundle) and in the
wireframes referenced from spec `001`. The chat transcript that produced the
wireframes captured the user's explicit choice of SvelteKit (not React) and
the form-first profile editor stance.

## Review Order

1. `001-local-ui-app-shell.md`
2. `002-local-ui-profile-editor.md`
3. `003-local-ui-artifacts-viewer.md`
4. `004-local-ui-doctor-viewer.md`

## Implementation Gate

Phase 6 verification:

- specs `001` through `004` are approved
- the SvelteKit app reads `ai-profile.yaml`, runs the compiler in memory, and
  runs the doctor — all locally, no outbound network
- the UI never writes generated files; it always defers to the CLI
- the UI surfaces the safety mode and trust banner on every screen that shows
  generated data
- the UI never displays raw profile YAML by default; YAML is opt-in

## Out of Scope For Phase 6

- write-capable actions in the browser (compile/write, init, import)
- diff-before-write UI (Phase 5 owns the contract; Phase 6 only views)
- account, login, sync, telemetry
- third-party MCP install or browse
- light theme parity (dark only; light theme is a follow-up after dashboard
  variant is selected)
- collaboration / multi-user
- Tabnine/Codex/Claude credential entry

## Stub Routes (visible-but-deferred)

The wireframes show eight in-app screens plus a Landing page. The four
real Phase 6 screens (Profile, Artifacts, Doctor, Settings) have full
specs above. The remaining sidebar entries are stubs to keep the
navigation visually faithful to the design without expanding scope:

- `/diff` — placeholder pointing at the Phase 5 CLI
  `agent-profile compile --dry-run` and the deferred
  `phase-later/004-cli-diff-command.md` spec.
- `/targets` — static reference card derived from the validated
  profile's `clients` block. Read-only; no compiler call. Implemented as
  a small `+page.server.ts` that reads `loadProjectContext` only.
- `/activity` — placeholder. The activity log itself is not yet recorded;
  the page exists so the nav matches the design.
- `/landing` — single-page hero + before/after diagram + CLI walkthrough +
  roadmap. Lives inside the app shell for Phase 6; a layout-reset to
  remove the sidebar/titlebar chrome is a follow-up if marketing fidelity
  matters.

Stubs must not introduce new compiler/doctor APIs and must not perform
writes. They are subject to the same security rules as the four real
routes.
