# Task Ledger

Index only - task content lives in the linked issue briefs.
States: `ready | blocked | sequenced | parallel-safe | human-gate | in-progress | done`

## phase-24: Workflow Upgrade (`docs/specs/phase-24/001-workflow-upgrade-skills.md`)

| Id | Task | State | Brief |
| --- | --- | --- | --- |
| I1 | Skill invocation policy (flag table + per-target pin) | done | [001-skill-invocation-policy.md](docs/specs/phase-24/issues/001-skill-invocation-policy.md) |
| I2 | Grill + synthesis content (Design-it-Twice, Seam & Interface Design, writes) | done | [002-grill-synthesis-content.md](docs/specs/phase-24/issues/002-grill-synthesis-content.md) |
| I3 | TDD enforcement content (anti-patterns, mock boundary, escape hatch) | done | [003-tdd-enforcement-content.md](docs/specs/phase-24/issues/003-tdd-enforcement-content.md) |
| I4 | implement-next skill + emission rule | done | [004-implement-next-skill.md](docs/specs/phase-24/issues/004-implement-next-skill.md) |
| I5 | Informational doctor notes + docs | done | [005-doctor-informational-notes.md](docs/specs/phase-24/issues/005-doctor-informational-notes.md) |

Recommended merge order (shared content files): I2 -> I3 -> I1 -> I4 -> I5.

## phase-25: Logging Guidance (`docs/specs/phase-25/001-logging-guidance.md`)

| Id | Task | State | Brief |
| --- | --- | --- | --- |
| I1 | Schema key + guidance topic emission | done | [001-schema-and-topic-emission.md](docs/specs/phase-25/issues/001-schema-and-topic-emission.md) |
| I2 | Conditional enforcement lines | done | [002-conditional-enforcement-lines.md](docs/specs/phase-25/issues/002-conditional-enforcement-lines.md) |
| I3 | Wizard checkbox + docs/ADRs | done | [003-wizard-checkbox-and-docs.md](docs/specs/phase-25/issues/003-wizard-checkbox-and-docs.md) |

Recommended merge order: I1 -> I2 -> I3 (I2 and I3 are mutually parallel-safe).

## phase-26: Interactive CLI Presentation (`docs/specs/phase-26/001-clack-cli-presentation.md`)

Spec approved 2026-07-06. `@clack/prompts@1.7.0` installed (exact pin).

| Id | Task | State | Brief |
| --- | --- | --- | --- |
| WS1-I1 | Clack adapter, lazy-load gate, cancel contract | done | [001-clack-adapter-cancel-contract.md](docs/specs/phase-26/issues/001-clack-adapter-cancel-contract.md) |
| WS1-I2 | Logo, intro/outro framing, message-style pass | done | [002-logo-framing-style.md](docs/specs/phase-26/issues/002-logo-framing-style.md) |
| WS2-I1 | Compile/doctor/ui static presentation | done | [003-static-presentation.md](docs/specs/phase-26/issues/003-static-presentation.md) |
| WS3-I1 | Assist wizard step | blocked | [004-assist-wizard-step.md](docs/specs/phase-26/issues/004-assist-wizard-step.md) |

Recommended merge order: WS1-I1 -> WS1-I2 -> WS2-I1 -> WS3-I1. WS3-I1 is
blocked on phase-20 WS3-I3 plus the narrowed WS3-I6 checklist (Codex
project-MCP proof; Claude-first sequencing permitted).

## phase-27: Ownership + Upgrade Lifecycle (`docs/specs/phase-27/001-import-ownership-lockfile-conformance.md`)

Specs 001, 002, 003 approved (001 2026-07-07; 002 and 003 2026-07-08);
004 awaits a grill session.

| Id | Task | State | Brief |
| --- | --- | --- | --- |
| I1 | Lockfile-first classification in the import report | done | [001-lockfile-first-classification.md](docs/specs/phase-27/issues/001-lockfile-first-classification.md) |
| I2 | Capability catalog + `upgrade.catalogVersion` provenance | done | [002-capability-catalog-provenance.md](docs/specs/phase-27/issues/002-capability-catalog-provenance.md) |
| I3 | `upgrade` command: wizard, insertion editor, report mode | done | [003-upgrade-command.md](docs/specs/phase-27/issues/003-upgrade-command.md) |
| I4 | Compile drift classification flow | done | [004-drift-reconciliation-flow.md](docs/specs/phase-27/issues/004-drift-reconciliation-flow.md) |
| I5 | Flow guidance conformance patch (0.4.3) | ready | [005-flow-guidance-conformance.md](docs/specs/phase-27/issues/005-flow-guidance-conformance.md) |

I3 and I4 are parallel-safe apart from shared `apps/cli/src/index.ts`
touchpoints; coordinate merges (if I3 lands first, rebase I4 onto it).

Unblocked 2026-07-07 (twice): first amendment authorizes the minimal
manual-owned branch in `planRegionAwareWrites`; second amendment
redefines parity - category equality for lockfile-backed rows, an
expected-pair table for no-entry rows (the markerless divergence is the
phase-14 consent-gated adoption design, not a bug). No further behavior
change authorized.

## phase-28: Release Automation (`docs/specs/phase-28/001-release-automation.md`)

Spec 001 approved 2026-07-09 (ADR 0012 accepted).

| Id | Task | State | Brief |
| --- | --- | --- | --- |
| I1 | Release scripts + release-prepare workflow | done | [001-release-scripts-prepare-workflow.md](docs/specs/phase-28/issues/001-release-scripts-prepare-workflow.md) |
| I2 | Auto-tag workflow | done | [002-auto-tag-workflow.md](docs/specs/phase-28/issues/002-auto-tag-workflow.md) |
| I3 | Publish job + dry-run gate + GitHub Release | done | [003-publish-job.md](docs/specs/phase-28/issues/003-publish-job.md) |
| I4 | Trusted-publisher setup + rehearsal + release.md rewrite | done | [004-trusted-publisher-rehearsal.md](docs/specs/phase-28/issues/004-trusted-publisher-rehearsal.md) |
| I5 | Verified bump commit via the GitHub API | done | [005-verified-bump-commit.md](docs/specs/phase-28/issues/005-verified-bump-commit.md) |

I5 is a follow-up fix from the first live run: release-prepare's bump
commit was unsigned and blocked by the require-signed-commits rule
(PR #80 re-signed by hand). It does not block 0.4.2.

## phase-29: Tabnine Workflow Skills (`docs/specs/phase-29/001-tabnine-workflow-skills.md`)

Spec 001 approved 2026-07-10 (ADR 0013 accepted, superseding ADR 0007
for the skills layer).

| Id | Task | State | Brief |
| --- | --- | --- | --- |
| I1 | Shared-convention skill emission for Tabnine + exclusions + goldens | sequenced | [001-shared-skills-emission.md](docs/specs/phase-29/issues/001-shared-skills-emission.md) (after phase-27 I5, golden churn separation) |
