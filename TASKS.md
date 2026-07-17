# Task Ledger

Index only - task content lives in the linked issue briefs.
States: `ready | blocked | sequenced | parallel-safe | human-gate | in-progress | done`

## phase-24: Workflow Upgrade (`docs/specs/phase-24/001-workflow-upgrade-skills.md`)

| Id  | Task                                                                         | State | Brief                                                                                                     |
| --- | ---------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------- |
| I1  | Skill invocation policy (flag table + per-target pin)                        | done  | [001-skill-invocation-policy.md](docs/specs/phase-24/issues/001-skill-invocation-policy.md)               |
| I2  | Grill + synthesis content (Design-it-Twice, Seam & Interface Design, writes) | done  | [002-grill-synthesis-content.md](docs/specs/phase-24/issues/002-grill-synthesis-content.md)               |
| I3  | TDD enforcement content (anti-patterns, mock boundary, escape hatch)         | done  | [003-tdd-enforcement-content.md](docs/specs/phase-24/issues/003-tdd-enforcement-content.md)               |
| I4  | implement-next skill + emission rule                                         | done  | [004-implement-next-skill.md](docs/specs/phase-24/issues/004-implement-next-skill.md)                     |
| I5  | Informational doctor notes + docs                                            | done  | [005-doctor-informational-notes.md](docs/specs/phase-24/issues/005-doctor-informational-notes.md)         |
| I6  | Automatic post-grill synthesis and persistence authorization                 | done  | [006-automatic-post-grill-synthesis.md](docs/specs/phase-24/issues/006-automatic-post-grill-synthesis.md) |

Recommended merge order (shared content files): I2 -> I3 -> I1 -> I4 -> I5 -> I6.

## phase-25: Logging Guidance (`docs/specs/phase-25/001-logging-guidance.md`)

| Id  | Task                                 | State | Brief                                                                                                   |
| --- | ------------------------------------ | ----- | ------------------------------------------------------------------------------------------------------- |
| I1  | Schema key + guidance topic emission | done  | [001-schema-and-topic-emission.md](docs/specs/phase-25/issues/001-schema-and-topic-emission.md)         |
| I2  | Conditional enforcement lines        | done  | [002-conditional-enforcement-lines.md](docs/specs/phase-25/issues/002-conditional-enforcement-lines.md) |
| I3  | Wizard checkbox + docs/ADRs          | done  | [003-wizard-checkbox-and-docs.md](docs/specs/phase-25/issues/003-wizard-checkbox-and-docs.md)           |

Recommended merge order: I1 -> I2 -> I3 (I2 and I3 are mutually parallel-safe).

## phase-26: Interactive CLI Presentation (`docs/specs/phase-26/001-clack-cli-presentation.md`)

Spec approved 2026-07-06. `@clack/prompts@1.7.0` installed (exact pin).

| Id     | Task                                           | State   | Brief                                                                                                   |
| ------ | ---------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------- |
| WS1-I1 | Clack adapter, lazy-load gate, cancel contract | done    | [001-clack-adapter-cancel-contract.md](docs/specs/phase-26/issues/001-clack-adapter-cancel-contract.md) |
| WS1-I2 | Logo, intro/outro framing, message-style pass  | done    | [002-logo-framing-style.md](docs/specs/phase-26/issues/002-logo-framing-style.md)                       |
| WS2-I1 | Compile/doctor/ui static presentation          | done    | [003-static-presentation.md](docs/specs/phase-26/issues/003-static-presentation.md)                     |
| WS3-I1 | Assist wizard step                             | blocked | [004-assist-wizard-step.md](docs/specs/phase-26/issues/004-assist-wizard-step.md)                       |

Recommended merge order: WS1-I1 -> WS1-I2 -> WS2-I1 -> WS3-I1. WS3-I1 is
blocked on phase-20 WS3-I3 plus the narrowed WS3-I6 checklist (Codex
project-MCP proof; Claude-first sequencing permitted).

## phase-27: Ownership + Upgrade Lifecycle (`docs/specs/phase-27/001-import-ownership-lockfile-conformance.md`)

Specs 001-004, 006 approved and shipped (through 0.4.4); 007 approved
2026-07-12 (ADR 0014 amended: consent-gated follow-up chain).

| Id  | Task                                                     | State | Brief                                                                                                   |
| --- | -------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------- |
| I1  | Lockfile-first classification in the import report       | done  | [001-lockfile-first-classification.md](docs/specs/phase-27/issues/001-lockfile-first-classification.md) |
| I2  | Capability catalog + `upgrade.catalogVersion` provenance | done  | [002-capability-catalog-provenance.md](docs/specs/phase-27/issues/002-capability-catalog-provenance.md) |
| I3  | `upgrade` command: wizard, insertion editor, report mode | done  | [003-upgrade-command.md](docs/specs/phase-27/issues/003-upgrade-command.md)                             |
| I4  | Compile drift classification flow                        | done  | [004-drift-reconciliation-flow.md](docs/specs/phase-27/issues/004-drift-reconciliation-flow.md)         |
| I5  | Flow guidance conformance patch (0.4.3)                  | done  | [005-flow-guidance-conformance.md](docs/specs/phase-27/issues/005-flow-guidance-conformance.md)         |
| I6  | No-args interactive dispatcher                           | done  | [006-no-args-dispatcher.md](docs/specs/phase-27/issues/006-no-args-dispatcher.md)                       |
| I7  | Dispatcher follow-up offers + doctor/upgrade clarity     | done  | [007-dispatcher-follow-up-clarity.md](docs/specs/phase-27/issues/007-dispatcher-follow-up-clarity.md)   |

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

| Id  | Task                                                     | State | Brief                                                                                                         |
| --- | -------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------- |
| I1  | Release scripts + release-prepare workflow               | done  | [001-release-scripts-prepare-workflow.md](docs/specs/phase-28/issues/001-release-scripts-prepare-workflow.md) |
| I2  | Auto-tag workflow                                        | done  | [002-auto-tag-workflow.md](docs/specs/phase-28/issues/002-auto-tag-workflow.md)                               |
| I3  | Publish job + dry-run gate + GitHub Release              | done  | [003-publish-job.md](docs/specs/phase-28/issues/003-publish-job.md)                                           |
| I4  | Trusted-publisher setup + rehearsal + release.md rewrite | done  | [004-trusted-publisher-rehearsal.md](docs/specs/phase-28/issues/004-trusted-publisher-rehearsal.md)           |
| I5  | Verified bump commit via the GitHub API                  | done  | [005-verified-bump-commit.md](docs/specs/phase-28/issues/005-verified-bump-commit.md)                         |

I5 is a follow-up fix from the first live run: release-prepare's bump
commit was unsigned and blocked by the require-signed-commits rule
(PR #80 re-signed by hand). It does not block 0.4.2.

## phase-29: Tabnine Workflow Skills (`docs/specs/phase-29/001-tabnine-workflow-skills.md`)

Spec 001 approved 2026-07-10 (ADR 0013 accepted; ADR 0007 not
superseded - it carries only a dated staleness note). Shipped in 0.4.3.

| Id  | Task                                                                | State | Brief                                                                                                                                  |
| --- | ------------------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------- |
| I1  | Shared-convention skill emission for Tabnine + exclusions + goldens | done  | [001-shared-skills-emission.md](docs/specs/phase-29/issues/001-shared-skills-emission.md) (after phase-27 I5, golden churn separation) |

## phase-30: Role-Aware Indexed Subagents (`docs/specs/phase-30/001-role-aware-indexed-subagents.md`)

Spec 001 approved 2026-07-13 (ADRs 0015-0017 accepted).

| Id  | Task                                                    | State     | Brief                                                                                                               |
| --- | ------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------- |
| I1  | Canonical execution policy and client rendering         | done      | [001-canonical-execution-policy.md](docs/specs/phase-30/issues/001-canonical-execution-policy.md)                   |
| I2  | Task capsules and bounded orchestration                 | sequenced | [002-task-capsules-bounded-orchestration.md](docs/specs/phase-30/issues/002-task-capsules-bounded-orchestration.md) |
| I3  | Read-only indexed-context diagnostics                   | sequenced | [003-indexed-context-diagnostics.md](docs/specs/phase-30/issues/003-indexed-context-diagnostics.md)                 |
| I4  | Explicit indexed-context registration repair            | blocked   | [004-indexed-context-registration-repair.md](docs/specs/phase-30/issues/004-indexed-context-registration-repair.md) |
| I5  | Local workflow evidence                                 | sequenced | [005-local-workflow-evidence.md](docs/specs/phase-30/issues/005-local-workflow-evidence.md)                         |
| I6  | Adoption, upgrade, documentation, and final integration | sequenced | [006-adoption-integration-docs.md](docs/specs/phase-30/issues/006-adoption-integration-docs.md)                     |

Recommended merge order: I1 -> (I2 and I3, mutually parallel-safe apart from
shared schema/goldens) -> I4 and I5 -> I6. I4 is blocked until I3 is done.

## phase-31: Permission Posture Lifecycle (`docs/specs/phase-31/001-permission-posture-lifecycle.md`)

Spec and ADR amendments approved 2026-07-14. I1 is ready for the required
RED-first TDD implementation cycle.

| Id  | Task                                                     | State | Brief                                                                                                                                     |
| --- | -------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| I1  | Canonical permission posture plan and compatibility seam | done  | [001-canonical-permission-posture-plan.md](docs/specs/phase-31/issues/001-canonical-permission-posture-plan.md)                           |
| I2  | Capability-graded client mapping and shared generation   | done  | [002-client-mapping-and-shared-generation.md](docs/specs/phase-31/issues/002-client-mapping-and-shared-generation.md)                     |
| I3  | Permission-only inspection and reconciliation model      | done  | [003-permission-inspection-and-reconciliation-model.md](docs/specs/phase-31/issues/003-permission-inspection-and-reconciliation-model.md) |
| I4  | State-aware configure and atomic shared reconciliation   | done  | [004-configure-and-shared-reconciliation-flow.md](docs/specs/phase-31/issues/004-configure-and-shared-reconciliation-flow.md)             |
| I5  | Personal activation and manual client guidance           | done  | [005-personal-activation-and-manual-guidance.md](docs/specs/phase-31/issues/005-personal-activation-and-manual-guidance.md)               |
| I6  | Doctor posture severity and ownership-aware validation   | done  | [006-doctor-posture-severity-and-ownership.md](docs/specs/phase-31/issues/006-doctor-posture-severity-and-ownership.md)                   |
| I7  | Dispatcher permission routing and legacy migration entry | done  | [007-dispatcher-permission-routing.md](docs/specs/phase-31/issues/007-dispatcher-permission-routing.md)                                   |
| I8  | Published permission journey and final integration       | done  | [008-published-journey-and-final-integration.md](docs/specs/phase-31/issues/008-published-journey-and-final-integration.md)               |

Dependency map: I1 -> (I2 and I3); I1+I2+I3 -> I4; I2+I4 -> I5;
I1+I2+I3 -> I6; I4+I6 -> I7; I2-I7 -> I8. I2 and I3 are mutually
parallel-safe after I1 apart from shared canonical types.

## phase-31.5: Model Selection Lifecycle (`docs/specs/phase-31.5/001-model-selection-lifecycle.md`)

Approved 2026-07-16 from the completed model/effort grill. Sequenced after the
completed Phase 31 I8 and before Phase 32 I1.

| Id | Task | State | Brief |
| --- | --- | --- | --- |
| I1 | Shared model-policy domain and compatibility resolver | done | [001-shared-model-policy-domain.md](docs/specs/phase-31.5/issues/001-shared-model-policy-domain.md) |
| I1R | Complete v3 profile-schema integration | done | [001r-v3-profile-schema-integration.md](docs/specs/phase-31.5/issues/001r-v3-profile-schema-integration.md) |
| I2 | Codex and Claude exact model adapters | done | [002-codex-claude-model-adapters.md](docs/specs/phase-31.5/issues/002-codex-claude-model-adapters.md) |
| I3 | Tabnine historical, organization, and private models | sequenced | [003-tabnine-historical-private-models.md](docs/specs/phase-31.5/issues/003-tabnine-historical-private-models.md) |
| I4 | Consented source-free model probes | sequenced | [004-consented-source-free-probes.md](docs/specs/phase-31.5/issues/004-consented-source-free-probes.md) |
| I5 | Exact role-aware model selection during init | sequenced | [005-init-model-selection.md](docs/specs/phase-31.5/issues/005-init-model-selection.md) |
| I6 | Explicit model upgrade and locked resolution lifecycle | sequenced | [006-upgrade-and-lock-resolution.md](docs/specs/phase-31.5/issues/006-upgrade-and-lock-resolution.md) |
| I7 | Offline Doctor model policy and explicit recheck | sequenced | [007-doctor-model-policy.md](docs/specs/phase-31.5/issues/007-doctor-model-policy.md) |
| I8 | Local UI model policy and user documentation | sequenced | [008-local-ui-and-model-docs.md](docs/specs/phase-31.5/issues/008-local-ui-and-model-docs.md) |
| I9 | Published model-selection journey and final integration | sequenced | [009-published-model-journey.md](docs/specs/phase-31.5/issues/009-published-model-journey.md) |

I1R added 2026-07-17: I1 was marked done but never wired `preset`, the
`routine-implementer` role, or open exact-override acceptance into the public
profile parser/schema (only the pure `model-policy.ts` resolver and lockfile
side landed) - confirmed by three rejected parser probes. I2 depends on I1R
instead of being split; its own seam (resolution plan -> Codex/Claude
artifacts) remains one cohesive vertical slice, run as several focused
RED->GREEN cycles inside one task (adapter/status table; Codex generation and
ownership; Claude generation and ownership; combined goldens/legacy-identity/
docs/verification). If I2 still proves too large after I1R, split it
vertically by client (Codex end-to-end, then Claude end-to-end), not
horizontally by layer.

Dependency map: I1 -> (I1R, I3, I4); I1R -> I2; I2+I3+I4 -> I5;
I1+I2+I3+I4 -> I6; I4+I6 -> I7; I2+I3+I5+I6+I7 -> I8;
I1-I8 -> I9; I9 -> Phase 32 I1. I2, I3, and I4 are parallel-safe after
I1 apart from shared exports and fixtures. I5 and I6 may proceed in parallel
after their prerequisites with shared CLI-entrypoint merge coordination.

## phase-32: Guided Repository Update (`docs/specs/phase-32/001-guided-repository-update.md`)

Approved 2026-07-14 from the repository-update field-test agreement. Phase 32
is sequenced after Phase 31.5 I9 so it reuses the completed permission and
model-selection lifecycles instead of adding temporary manual guidance.

| Id  | Task                                                  | State     | Brief                                                                                                     |
| --- | ----------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------- |
| I1  | Future-configuration ownership decision               | sequenced | [001-future-configuration-ownership.md](docs/specs/phase-32/issues/001-future-configuration-ownership.md) |
| I2  | Preserve custom MCP across compile and Doctor         | sequenced | [002-preserve-custom-mcp.md](docs/specs/phase-32/issues/002-preserve-custom-mcp.md)                       |
| I3  | Capability impact and editable-review model           | sequenced | [003-capability-impact-review-model.md](docs/specs/phase-32/issues/003-capability-impact-review-model.md) |
| I4  | Supported YAML insertion and exact refusals           | sequenced | [004-supported-yaml-insertion.md](docs/specs/phase-32/issues/004-supported-yaml-insertion.md)             |
| I5  | Editable interactive upgrade review and atomic apply  | sequenced | [005-editable-upgrade-flow.md](docs/specs/phase-32/issues/005-editable-upgrade-flow.md)                   |
| I6  | Published guided-update journey and final integration | sequenced | [006-published-update-journey.md](docs/specs/phase-32/issues/006-published-update-journey.md)             |

Dependency map: Phase 31.5 I9 -> (I1, I3, I4); I1 -> I2; I3+I4 -> I5;
I2+I5 -> I6. I1, I3, and I4 are parallel-safe after Phase 31.5; I6 is final
integration only.
