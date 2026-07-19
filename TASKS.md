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
| I3 | Tabnine historical, organization, and private models | done | [003-tabnine-historical-private-models.md](docs/specs/phase-31.5/issues/003-tabnine-historical-private-models.md) |
| I4 | Consented source-free model probes | done | [004-consented-source-free-probes.md](docs/specs/phase-31.5/issues/004-consented-source-free-probes.md) |
| I5 | Exact role-aware model selection during init | done | [005-init-model-selection.md](docs/specs/phase-31.5/issues/005-init-model-selection.md) |
| I5R | Tabnine write-plan wiring, advanced override entry, and model-selection docs | done | [005r-tabnine-write-wiring-and-advanced-override.md](docs/specs/phase-31.5/issues/005r-tabnine-write-wiring-and-advanced-override.md) |
| I6 | Locked model-resolution reuse primitive (ordinary compile reuses the lock) | done | [006-upgrade-and-lock-resolution.md](docs/specs/phase-31.5/issues/006-upgrade-and-lock-resolution.md) |
| I6a | Upgrade command exact comparison and retain/adopt/customize planning | ready | [006a-upgrade-comparison-and-planning.md](docs/specs/phase-31.5/issues/006a-upgrade-comparison-and-planning.md) |
| I6b | Metadata-only package/registry update check | sequenced | [006b-metadata-only-registry-check.md](docs/specs/phase-31.5/issues/006b-metadata-only-registry-check.md) |
| I6c | Upgrade-flow probe consent, separate from update-check consent | sequenced | [006c-probe-consent-separation.md](docs/specs/phase-31.5/issues/006c-probe-consent-separation.md) |
| I6d | Tabnine model-resolution reconciliation | sequenced | [006d-tabnine-lock-reconciliation.md](docs/specs/phase-31.5/issues/006d-tabnine-lock-reconciliation.md) |
| I6e | Upgrade write ownership refusal and rollback | sequenced | [006e-upgrade-write-rollback.md](docs/specs/phase-31.5/issues/006e-upgrade-write-rollback.md) |
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

Dependency map: I1 -> (I1R, I3, I4); I1R -> I2; I2+I3+I4 -> I5; I5 -> I5R;
I1+I2+I3+I4 -> I6; I6+I2+I5 -> I6a; I6a -> (I6b, I6e); I6a+I6b+I4 -> I6c
(I6c's own acceptance criteria require proving all four consent combinations
against I6b's real update-check consent, so I6c cannot start before I6b
lands); I1R+I3+I6 -> I6d (I6d now also depends on I1R as the precedent for
adding its own new `tabnine` override schema field); I4+I6e -> I7 (I7
depends on I6e, not base I6, since I7 needs the full upgrade write path
settled); I2+I3+I5+I6a-I6e+I7 -> I8; I1-I8+I5R -> I9; I9 -> Phase 32 I1.
I2, I3, and I4 are parallel-safe after I1 apart from shared exports and
fixtures. I5 and I6 may proceed in parallel after their prerequisites with
shared CLI-entrypoint merge coordination. I5R may proceed in parallel with
I6 once I5's wizard/preview seam is stable. I6b and I6d are parallel-safe
with each other once I6a's command shape stabilizes; I6c requires I6b to
land first (shared cross-consent proof) and is not parallel-safe with it;
I6e depends on I6a's write path existing and is independent of I6b/I6c/I6d.

I3 amendment 2026-07-17: I3 shipped `planTabnineModelSettingsWrite` as a
pure, unit-tested ownership-aware write plan for
`.tabnine/agent/settings.json` (ADR 0020 whole-file ownership, `model.id`
only) but left it unwired from any real compile/write pipeline - a disclosed,
reviewed scope reduction, not a defect. Confirmed I6-I9 as originally scoped
never picked the gap back up (all describe Tabnine only as
manual/advisory/guided). Per product decision the capability stays inside
Phase 31.5 rather than moving to a separate phase: I5's brief now includes an
explicit acceptance criterion wiring the write plan into init's real
write-preview flow (the same seam that first builds Codex/Claude
target-configuration write-preview), and I9's coverage list now names the
write branch alongside the manual path. I6/I7/I8 are not amended: I6/I8 never
claimed Tabnine target-file writes in scope, and I7 (Doctor) already covers
"ownership" generically in its seam, so drift detection for the newly-real
settings file needs no brief change - reassess only if I5's implementation
reveals a genuine I7 gap.

I5 completed 2026-07-18 via one RED-first implement-next cycle as a
disclosed partial slice: the wizard's model-preset step (role-aware default,
exact per-role model/effort/status tables rendered before commit per AC1),
the consented probe step, and the offline `--probe-models` rejection are
implemented, tested, and passed spec/code-quality review. Three of I5's own
acceptance criteria were explicitly deferred rather than delivered - AC2/AC4
(advanced per-role/exact-override entry UI) and AC5/AC8 (I3's
`planTabnineModelSettingsWrite` still not wired into any real write
pipeline) - plus I5's documentation-impact section. Spec review confirmed
these as genuine, disclosed gaps (not silently dropped) and recommended
tracking them as follow-up rather than blocking I5's closure, the same
precedent already set for I3's disclosed Tabnine-wiring scope reduction.
I5R carries that remaining scope; I9's final-integration coverage list
should account for I5R, not just I5, when it runs.

I6 completed 2026-07-18 (spec + code-quality review passed) for its own
foundational scope only: the "ordinary compile reuses the lock" primitive
for v3 Codex/Claude model resolutions, later hardened 2026-07-19 (generated
files and lockfile now derive from one reconciled table; removing an
override re-resolves fresh; reused rows carry their own `catalogVersion`)
after PR review found the first cut left generated files inconsistent with
the lock. See the dated addenda in I6's own issue brief for exact scope,
files, and disclosed gaps.

I6 split 2026-07-19 into I6a-I6e: the "one task, several focused cycles"
pattern from I2 does not fit here, because I6's remaining acceptance
criteria are independently-shaped CLI/UX/network/consent/adapter concerns
(upgrade comparison+planning, metadata registry check, probe consent,
Tabnine reconciliation, write rollback), not vertical slices of one seam.
Each is its own issue brief and ledger row so `/implement-next` can advance
them one bounded cycle at a time. I6a is `ready`; I6b-I6e are `sequenced`
pending I6a's command shape stabilizing (see each brief's Parallelism notes
for which pairs can then run in parallel).

Also found and fixed 2026-07-19, as a separate PR unrelated to I6 itself:
`apps/cli/src/configure.ts`'s `buildCompileWrites` call omitted `profile`,
so every lockfile `configure` wrote silently erased its `modelPolicy` block.
Pre-existing bug, surfaced while reviewing I6's disclosed gaps.

I6a first RED-first cycle completed 2026-07-19 as a disclosed partial slice
(one bounded `/implement-next` cycle, not full closure): added the pure
comparison helper `compareModelPolicyUpgrade`
(`packages/compiler/src/model-policy-upgrade-comparison.ts`), which recomputes
today's live-catalog resolution via the existing
`buildModelPolicyTargetTable` (deliberately without lock-reuse) and diffs it
row-by-row against a prior lock's `modelPolicy` rows (model/effort/capability
status/alternatives), producing `changed`/`reason` per role+client, for a
v3-opted profile only. Spec and code-quality review both passed with no
blocking findings. Left for later I6a cycles: CLI wiring/table rendering
(`apps/cli/src/upgrade*.ts`), the mapping-v2 (legacy `resolveRoleMapping`)
comparison path, the five planning paths (retain/adopt/quality-first/
cost-conscious/custom), the actual write path, and the disclosed
lockfile-schema gap that locked rows carry no `lifecycle` field so `old`
rows cannot report a lifecycle comparison. State stays `ready` for the next
`/implement-next` cycle rather than `done`, since the brief's acceptance
criteria are not yet met.

I6a fifth RED-first cycle completed 2026-07-19, also a disclosed partial
slice: wired an actual write path for `--model-policy-strategy adopt
--write` only. `"quality-first"`/`"cost-conscious"` with `--write` are
explicitly refused (stderr + exit 1, no file touched): writing their plan's
block into `ai-profile.lock` without also updating `ai-profile.yaml`'s
`subagentPolicy.preset` would be silently inert on the next ordinary
compile, since `deriveLockedClientOverride`
(`packages/compiler/src/model-policy-target-adapter.ts`) only reuses a
locked row when the lock's own `preset` matches the profile's current
preset - verified, not assumed. `"adopt"` always resolves under the
profile's own current preset, so its write is always consistent with
`ai-profile.yaml` unchanged; `"adopt" --write` with no existing
`ai-profile.lock` also refuses cleanly. The write reuses the existing
`applyWritePlan` atomic-write helper (no new rollback/ownership logic - that
stays I6e's job) and is fully self-contained: no capability-catalog
interaction, no interactive-prompt entry, no YAML edit. Spec review passed
COMPLIANT. Code-quality review found ISSUES_FOUND, non-blocking (three
independent re-derivations of the lockfile's canonical `(client, role)` sort
comparator - one in the new CLI write branch, two in its tests) - fixed
before closing the cycle by exporting the compiler package's own
`compareModelPolicyResolutions` (previously private in
`packages/compiler/src/lockfile.ts`) via `packages/compiler/src/index.ts`
and importing it at all three sites instead of re-deriving `localeCompare`
chains. Re-ran `npm test`/`npm run check` for both `apps/cli` (513
tests/509 pass/0 fail/4 unrelated skips) and `packages/compiler` (298
tests/297 pass/0 fail/1 unrelated skip) after the fix: both clean. Still
left for later I6a cycles: writing `quality-first`/`cost-conscious` (needs a
paired `ai-profile.yaml` `subagentPolicy.preset` surgical edit), interactive
clack rendering/selection/write-confirmation, the "custom exact" strategy,
mapping-v2 comparison/planning/write, combining a model-policy write with
the capability-catalog write in one invocation, and the disclosed
lifecycle-comparison gap from cycle 1. State stays `ready`, not `done`.

I6a fourth RED-first cycle completed 2026-07-19, also a disclosed partial
slice: added `--model-policy-strategy <retain|adopt|quality-first|
cost-conscious>` to `agent-profile upgrade` (`apps/cli/src/index.ts`), which
PREVIEWS `planModelPolicyUpgrade`'s plan for the chosen strategy in the
JSON/text report output only - no disk write this cycle. Non-v3-opted
profiles refuse fast (stderr + exit 1, no output/writes) before an
unrecognized profile is ever reported on; a v3-opted profile gets a
`modelPolicyPlan` field/section following the same three-state omit/empty/
populated pattern established in cycle 2. Spec review passed COMPLIANT.
Code-quality review found ISSUES_FOUND (both non-blocking, fixed inline
before closing the cycle): (1) the v3-opt-in guard
(`subagentPolicy?.enabled === true && subagentPolicy.preset !== undefined`)
was duplicated verbatim at three call sites - extracted into a single named
type-guard `hasV3ModelPreset` that still narrows `preset` correctly at every
use; (2) the "flag omitted -> `modelPolicyPlan` absent" regression case was
missing for a v3-opted profile specifically - added
(`apps/cli/src/upgrade.test.ts`). Re-ran `npm test`/`npm run check` for
`apps/cli` after both fixes: 507 tests, 503 pass, 0 fail, 4 pre-existing
unrelated skips, clean typecheck. Still left for later I6a cycles: the
actual write path (writing the chosen plan into `ai-profile.lock`, and
updating `subagentPolicy.preset` in `ai-profile.yaml` for a bulk-preset
switch), interactive clack rendering/selection, the "custom exact" strategy,
mapping-v2 comparison/planning, and the disclosed lifecycle-comparison gap
from cycle 1. State stays `ready`, not `done`.

I6a third RED-first cycle completed 2026-07-19, also a disclosed partial
slice: added `planModelPolicyUpgrade`
(`packages/compiler/src/model-policy-upgrade-planning.ts`), a thin pure
helper that turns a chosen bulk strategy ("retain", "adopt", "quality-first",
"cost-conscious") into the exact lockfile `modelPolicy` block that strategy
would write if accepted, by directly chaining the existing
`buildModelPolicyTargetTable`/`toLockModelPolicyFromTargetTable` adapter
functions with no new resolution logic. "Retain" is a verbatim passthrough of
the prior lock (or `undefined` if none exists); the other three always
recompute fresh (never lock-reuse). Spec and code-quality review both passed;
code-quality flagged one Important, non-blocking finding (an uncommented
`"implementer"` role literal used to prove quality-first/cost-conscious
observably differ from adopt/role-aware) which was fixed inline before
closing the cycle (swapped to the exported `MODEL_POLICY_PRIMARY_ROLE`
constant with an explanatory comment). Still left for later I6a cycles: the
"custom exact" per-role/per-client strategy (needs real user-supplied
selections, not purely derivable), CLI wiring of any planning path,
interactive clack rendering, mapping-v2 legacy-resolver comparison/planning,
the actual write path, and the disclosed lifecycle-comparison gap from cycle
1. State stays `ready`, not `done`.

I6a second RED-first cycle completed 2026-07-19, also a disclosed partial
slice: wired `compareModelPolicyUpgrade` into `agent-profile upgrade`'s
existing report-emission paths (`apps/cli/src/index.ts`'s `runUpgrade`/
`emitUpgradeReport`) for a v3-opted profile only. JSON output gains a
`modelPolicyChanges` array (omitted entirely for a non-v3 profile, present
but empty when nothing drifted, populated with changed rows otherwise);
non-interactive text output gains a matching `model policy changes:` section
under the same three-state rule. Spec and code-quality review both passed
with no blocking findings; 4 new `apps/cli/src/upgrade.test.ts` cases cover
stale-lock JSON, stale-lock text, matching-lock empty-set, and the non-v3
regression case (496 passing, 0 fail, 0 regressions). Still left for later
I6a cycles: interactive clack rendering of the comparison table
(`apps/cli/src/upgrade-clack.ts` untouched), the mapping-v2 legacy-resolver
comparison path, the five planning paths, the actual write path, and the
disclosed lifecycle-comparison gap from the first cycle. State stays
`ready`, not `done`.

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
