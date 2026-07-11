# Spec: Command Flow Guidance Conformance (0.4.3 patch)

## Status

Approved 2026-07-10. Synthesized from the 0.4.1/0.4.2 field-test
findings review of the same date. Target release: 0.4.3.

## Problem

The 0.4.2 field test hit a literal dead-end loop: `upgrade` fails with
"ai-profile.lock was not found. Run `agent-profile compile` first." -
but compile defaults to dry-run, which only previews the lockfile and
writes nothing, so following the instruction verbatim loops forever.
Compounding defects: init's outro advises `upgrade` unconditionally
(guaranteed to fail right after a fresh init), compile's dry-run output
never says nothing was written, the wizard asks the
preserve-vs-regions strategy question even when the scan found nothing
to preserve (0.4.1 finding), the capability picker does not say which
packs produce artifacts for the selected clients (0.4.1 Tabnine
confusion), and the post-write report re-analyzes post-write state
under a heading that reads like pre-write state ("AGENTS.md: present
(generated)" moments after creating it).

## Goal

Every next-step line the CLI prints is state-computed and correct to
follow verbatim; questions without a real decision are skipped; the
plan and pack picker say what will actually be produced.

## Intent

Guidance conformance only: no new flows, no schema changes, no changes
to what gets generated - only to what is said, asked, and required.

## Decision Rules

1. Advice doubt -> compute from state (lockfile presence, catalog
   delta); never print a static next-step that can fail.
2. Question doubt -> a prompt with only one sensible answer is a
   skip-with-note, not a question.
3. Requirement doubt -> require an input file only when the command
   truly needs it; degrade per the documented seeding rule otherwise.

## Non-Goals

- The no-args dispatcher (phase-27/004; this patch fixes the messages,
  the dispatcher fixes the meta-problem).
- Back-navigation / recap-and-edit (dropped 2026-07-10; cost exceeds
  value).
- Tabnine skill emission (phase-29).
- Any change to generated artifacts, schemas, lockfile, or the
  region/ownership machinery.

## Behavior (binding)

1. Lockfile-missing message: `upgrade`'s refusal (and any other
   "run compile first" guidance) names the working command:
   `agent-profile compile --write`.
2. Upgrade without a lockfile: report mode runs using the spec-002
   seeding rule (missing catalogVersion - and a fortiori a missing
   lockfile - means "offer everything not enabled" from the profile
   alone). Write mode applies insertions and skips the catalogVersion
   stamp with a note ("recorded on next compile --write") when no
   lockfile exists; the enabled-check keeps adopted capabilities from
   being re-offered, so the skipped stamp is harmless.
3. Init next-step lines are state-computed and ordered: no lockfile ->
   "run `agent-profile compile --write`" first; the upgrade suggestion
   appears only when a lockfile exists (or after the compile line,
   phrased as the subsequent step). No path prints advice that fails
   when followed.
4. Compile dry-run output ends with an explicit line: nothing was
   written; run `agent-profile compile --write` to apply.
5. The wizard strategy question is skipped when the import scan finds
   no existing root instruction files; a one-line note states the
   create-only default (strategy `preserve`), and the outcome is
   unchanged from answering the old question with its default.
6. Capability picker options carry client-applicability hints (for
   example "Claude/Codex only" on reviewer subagents and, until
   phase-29 lands, on the workflow-skill-dependent rows for
   Tabnine-only selections); the plan summary notes packs that produce
   no artifacts for the selected clients.
7. Write-mode reports are labeled as post-write state ("Files report
   (state after write)") so "present (generated)" and "already ignored"
   lines read as results, not contradictions.

## Contracts

- Text-output changes (messages, next-step lines, dry-run hint, report
  label) are behavior-corrective and intentionally alter affected
  goldens/fixtures; the change list is documented in the CHANGELOG
  entry. `--json` report field names and shapes are unchanged.
- The strategy-question skip changes no `WizardOutcome` semantics: the
  skipped case yields exactly the previous default (`preserve`).
- Upgrade's seeding behavior follows spec 002's existing rule; no new
  lockfile schema, no stamping without a lockfile.
- Interactive-only surfaces (picker hints) follow the phase-26 gate
  rules; non-interactive output changes only where a binding line above
  says so.

## Security Rules

- No new write paths, prompts for secrets, network, or dependencies.
- Message changes never weaken a refusal into an auto-action; every
  refusal still refuses, it just names the working command.

## Acceptance Criteria

1. Following the CLI's printed advice verbatim from `init` on an empty
   repo reaches a compiled, upgradable state with zero failing
   commands (integration-style test scripted over a temp dir:
   init -> printed advice -> compile --write -> upgrade).
2. `upgrade` without a lockfile: report mode lists offered capabilities
   from the profile; write mode inserts and notes the deferred stamp;
   with a lockfile, behavior is unchanged.
3. Compile dry-run output ends with the nothing-written line; write
   mode does not print it.
4. Wizard on a repo with no root instruction files: no strategy
   question, the skip note appears, outcome equals the old default
   (existing wizard tests updated only where they asserted the
   question's presence).
5. Tabnine-only capability selection shows the applicability hints and
   the plan note.
6. Write-mode report carries the post-write label.
7. Released as 0.4.3 with a CHANGELOG entry enumerating the corrected
   texts.

## Tests

- Temp-dir integration test for the advice-path (AC1) - the regression
  test for the reported loop.
- Unit tests per message/state matrix (lockfile present/absent x
  command); upgrade seeding tests (report + write, stamp deferred).
- Wizard skip test + updated question-presence assertions.
- Picker-hint and plan-note tests via injected prompts.
- Golden updates limited to the enumerated corrected texts; all other
  fixtures byte-identical.

## TDD Strategy

RED: the AC1 advice-path integration test fails today at the
upgrade-after-compile-dry-run step; the seeding, skip, and hint tests
fail before implementation. GREEN per the behavior list; goldens
regenerated only for enumerated texts.

## Documentation Updates

- CHANGELOG 0.4.3 entry enumerating corrected texts.
- docs/cli or README command examples where they quote the old advice.

## Issue Plan

- I5: all seven behaviors + tests in one patch issue (they share the
  same files and the same review). Brief on approval.

## Final Review Checklist

- AC1 integration test present and green (the loop is regression-proof).
- Golden diff contains only the enumerated texts.
- No generated-artifact or schema changes.
- Refusals still refuse; advice lines verified against actual command
  defaults.
