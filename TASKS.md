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
| I6a | Upgrade command exact comparison and retain/adopt/customize planning | done | [006a-upgrade-comparison-and-planning.md](docs/specs/phase-31.5/issues/006a-upgrade-comparison-and-planning.md) |
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

I6a PR review fix round (2026-07-20, PR #125) addressed 8 new Codex bot
findings (2 P1, 6 P2) on the accumulated cycles 1-9 work, on top of the two
earlier fix rounds already noted above: (1) `adopt --write` now prints the
old/new plan before applying it (the write branch previously bypassed
`printModelPolicyTextReport` entirely); (2) `adopt --write` now refuses when
an affected generated file is manual-owned, since `planRegionAwareWrites`
correctly leaves its bytes untouched but the lock would otherwise still
claim the fresh resolution was adopted; (3) a new
`readExistingTabnineModelId` helper preserves an existing, correct,
generated-owned Tabnine settings entry during an unrelated model-policy
adopt, instead of silently dropping it from the rewritten lock; (4) adopt-
write's success report now derives `wrote`/`modelPolicyWrote` from the
actual write-plan counts instead of unconditionally claiming a mutation
occurred; (5) `compareModelPolicyUpgrade`'s `changed` predicate now also
fires on a `source` difference (e.g. catalog -> explicit-override with an
otherwise-identical row); (6) `old.lifecycle` is now derived by looking up
the locked model against the same live catalog constants `fresh.lifecycle`
uses (not a lockfile schema change - the disclosed gap from cycle 1 is
resolved this way rather than by adding a stored field); (7) the mapping-v2
comparison's `legacy` side gained `alternatives`/`lifecycle`/
`capabilityStatus` as honest fixed constants (`[]`/`"unrated"`/`"advisory"`)
reflecting that mapping-v2 structurally has none of these concepts, rather
than omitting them; (8) `--help` text now documents the `adopt --write`
exception instead of claiming every model-policy write is refused. Both
text formatters were enriched to render the new fields as real old->new
comparisons. Spec review passed COMPLIANT and code-quality review passed
ACCEPTABLE (one non-blocking Important note - an overly verbose type-guard
chain in `readExistingTabnineModelId` - simplified before closing). Tests:
`packages/core` 213/212, `packages/compiler` 307/306, `apps/cli` 530/526,
all 0 failures; clean typecheck on all three; `verify:pack` and golden
regeneration both clean. All 11 findings from the first two review rounds
plus these 8 (except the disclosed "custom exact" non-goal) resolved as
GitHub review threads. State stays `ready`, not `done` - the underlying
brief acceptance criteria (custom-exact, mapping-v2/quality-first/
cost-conscious writes, interactive UI) remain open for later cycles.

I6a PR review fix round 4 (2026-07-20, PR #125) addressed 3 new Codex bot P2
findings surfaced after fix round's own changes landed: (1) the manual-owned
refusal in `runModelPolicyAdoptWrite` was too broad - it fired for ANY
manual-owned generated output, even one with nothing to do with model-policy
resolution (e.g. a reconciled skill file), needlessly blocking otherwise-safe
adoptions; narrowed via a new `MODEL_POLICY_BEARING_PATHS` constant
(`AGENTS.md`, `CLAUDE.md`, `.codex/config.toml`,
`.tabnine/guidelines/87-subagent-task-capsules.md`) so the refusal only fires
for a manual-owned path whose content actually encodes a model-policy
resolution; (2) `formatModelPolicyChangeLine` (v3-opted text report) rendered
`source`/`catalogVersion` only as part of the reason label, not as an
old -> new provenance line like every other field - enriched to show both
explicitly; (3) `compareModelPolicyUpgrade` compared only per-row fields,
so a locked block whose block-level `preset` or `catalogVersion` differed
from the fresh target (with every individual row's own resolved fields
otherwise byte-identical) was silently reported as fully unchanged, even
though Adopt would still rewrite those two block-level fields - fixed by
folding a `blockReasons` check (`previous.preset !== preset`,
`previous.catalogVersion !== MODEL_POLICY_TARGET_CATALOG_VERSION`) into
every row's own reasons. Added regression tests for all three: an
unrelated-manual-owned-file-does-not-block-adoption CLI test, a text-report
source/catalogVersion-provenance CLI test, and two compiler tests (preset-
changed-but-rows-identical, block-catalogVersion-changed-but-rows-identical).
Tests: `packages/compiler` 309/308, `apps/cli` 532/528, both 0 failures;
clean typecheck on both; `verify:pack` and golden regeneration both clean.
All 3 findings resolved as GitHub review threads. State stays `ready`, not
`done` - same open acceptance criteria as noted above.

Fix round 4's PR verify job initially failed CI's `npm run check` (2026-07-20,
PR #125) with two type errors neither `npm run build` nor a plain `tsc -b`
had caught: `apps/cli/src/upgrade.test.ts`'s new manual-owned lock-mutation
test literal typed too narrow for the reassigned shape, and
`packages/compiler/src/model-policy-upgrade-comparison.test.ts`'s new
preset-changed test used `"uniform"`, not a valid `ModelPolicyPreset`. Fixed
by loosening the test's parsed-lock type and correcting the preset literal
to `"quality-first"`. Root cause: `npm run check` runs `tsc -p
tsconfig.test.json --noEmit` in addition to the ordinary build, and CI runs
`check`, not `build` - both must be run locally before pushing test-only
changes, not just `build`.

I6a PR review fix round 5 (2026-07-20, PR #125) addressed 4 new Codex bot P2
findings surfaced after round 4 landed: (1) the mapping-v2 legacy comparison
(`compareModelPolicyUpgradeFromLegacy`) only compared model/effort, so a
role whose exact override already pinned the v3 target's own model (a
legitimate mapping-v2 configuration) was reported unchanged even though
Adopt would still rewrite the row's lifecycle/capabilityStatus from
mapping-v2's fixed "unrated"/"advisory" constants to the v3 target's real
values - fixed by comparing lifecycle/capabilityStatus/alternatives too,
reusing `compareModelPolicyUpgrade`'s own `alternativesDiffer` (now
exported) so the two comparisons can never disagree about that rule; (2)
the scripted `--json --write --adopt-recommended` success record built its
own JSON object from scratch, separately from `emitUpgradeReport`, and
never included the model-policy comparison fields at all - fixed by
extracting a shared `buildModelPolicyJsonFields` helper both call sites now
use; (3) `compareModelPolicyUpgrade` never compared `effortStatus`, so a
locked row differing only there (model/effort/capabilityStatus/
alternatives/source/catalogVersion all matching) was reported unchanged
even though Adopt would still serialize the fresh `effortStatus` - added a
`effortStatus` field to both `old`/`fresh` and a comparison check; (4) the
comparison for a selected `--model-policy-strategy quality-first`/
`cost-conscious` still resolved against the profile's current preset
instead of the actually-selected target, so the report's comparison table
and the plan beneath it could show two different presets for the same
requested strategy - fixed via a `modelPolicyComparisonPreset` derivation
mirroring `planModelPolicyUpgrade`'s own targetPreset logic, shared by both
the v3 and mapping-v2 comparison calls. Added regression tests for all
four: a mapping-v2-model-matches-but-lifecycle-differs compiler test, a
scripted-write-JSON-includes-model-fields CLI test, an
effortStatus-only-change compiler test, and a
compare-against-selected-strategy CLI test. Tests: `packages/compiler`
311/310, `apps/cli` 534/530, both 0 failures; clean typecheck on both
(including `tsconfig.test.json`); `verify:pack` and golden regeneration
both clean. All 4 findings resolved as GitHub review threads. State stays
`ready`, not `done` - same open acceptance criteria as noted above.

I6a tenth RED-first cycle completed 2026-07-20, also a disclosed partial
slice: added `planSubagentPolicyPresetEdit`
(`apps/cli/src/upgrade-model-policy-editor.ts`), a pure surgical YAML-edit
helper that sets `subagentPolicy.enabled: true` and `subagentPolicy.preset:
<preset>` in a profile's source without re-rendering the whole document -
the still-missing piece blocking both quality-first/cost-conscious writes
(v3-opted) and mapping-v2-adopting-v3 writes, since both need to edit
`ai-profile.yaml` itself, not just the lock. Reuses `configure.ts`'s
existing "surgical profile editing" byte-splice engine
(`editScalarUnder`, newly exported, purely additive, no behavior change)
twice in sequence (enabled, then preset) with a re-parse in between, since
`editScalarUnder` reads byte offsets from whatever source string it's
handed. Handles all four starting shapes: `subagentPolicy` absent,
present-disabled, present-enabled-no-preset (mapping-v2), and
present-enabled-different-preset (bulk switch) - idempotent-safe when
`enabled` is already `true`. No CLI wiring yet - a later cycle wires this
into the actual write paths. Spec review passed COMPLIANT. Code-quality
review found ISSUES_FOUND, two non-blocking-but-fixed items: (1) the
re-parse-between-edits step had no comment explaining why reusing the
original document/source pair for the second edit would silently corrupt
output at stale byte offsets - added; (2) a test asserting "only the
preset scalar's bytes changed" used a `\s+`-tolerant regex that wouldn't
actually catch a reflow/reindent bug - replaced with an exact
byte-equality assertion against the original fixture with only the preset
substring swapped. Re-ran `npm test`/`npm run check` for `apps/cli` (527
tests/523 pass/0 fail/4 unrelated skips) after both fixes: clean. Still
left for later I6a cycles: wiring `planSubagentPolicyPresetEdit` into the
actual `--write` paths for quality-first/cost-conscious (v3-opted) and
mapping-v2-adopt (both also still need the atomic multi-file write
treatment cycle 9 already built for "adopt", extended to also touch
`ai-profile.yaml`), the "custom exact" strategy (disclosed, pre-existing
non-goal), and the disclosed lifecycle-comparison gap from cycle 1. State
stays `ready`, not `done`.

I6a PR review fix round 6 (2026-07-20, PR #125) addressed 8 new Codex bot
findings (1 P1, 7 P2) surfaced after the eleventh cycle's quality-first/
cost-conscious write wiring landed: (1) a drifted generated-owned
`.tabnine/agent/settings.json` was silently accepted (no refusal, ownership
record dropped from the rewritten lock) since `classifyTabnineSettingsOwnership`
collapses drift into the same "unowned" result a manual-owned entry gets;
(2) a manual-owned Tabnine settings entry lost its provenance the same way;
(3) the JSON adopt-write success response omitted `modelPolicyChanges`/
`modelPolicyPlan`, reporting only mutation counts; (4) the text formatter
never rendered `effortStatus`, even though the comparator already reports
an "effort status changed" reason; (5) the text-mode strategy-plan preview
reduced every row to bare model/effort, discarding effort status/
alternatives/source/per-row catalog version and never showing the block's
own preset/catalogVersion - especially lossy for Retain, whose values can
legitimately differ from the fresh comparison shown above it; (6, P1) a
bulk preset switch (`quality-first`/`cost-conscious --write`) mutated
`ai-profile.yaml` and generated files with no file-level preview at all
(only the model-policy comparison table), breaking the mutation contract
every other write path in this repository already follows; (7)
`planModelPolicyUpgrade` silently dropped a prior lock's `client: "tabnine"`
rows for every non-retain strategy, since it only ever resolves Codex/Claude
rows from the target table - a real Adopt write would then delete Tabnine's
provenance even though nothing about the strategy touches it; (8) the
success message's file count included `ai-profile.yaml`/`ai-profile.lock`
themselves, so "regenerated N target files" overstated the real target-file
count. Fixed: (1)+(2) unified into one `refuseIfTabnineProvenanceWouldBeLost`
refusal (extracted as a named helper per code-quality review) that reads the
prior on-disk lock before writing and refuses whenever a recorded Tabnine
entry can't be carried forward as `"generated-owned"` - also covers a third
edge case the code-quality review surfaced (Tabnine disabled after a prior
write recorded an entry), which the original fix from this same round
missed; (3) `runModelPolicyWrite` now threads `modelPolicyChanges`/
`modelPolicyLegacyChanges` through to `buildModelPolicyJsonFields(...)`;
(4)+(5) both text renderers now show every field the row/block actually
carries; (6) `previewBulkPresetSwitchWrites` (also extracted as a named
helper) does a dry-run `createOrApplyWritePlan` first, from the exact same
write array the real apply uses, and prints a `File changes (...):` section
before applying, non-JSON only; (7) `planModelPolicyUpgrade` now preserves
prior tabnine rows verbatim (documented as an intentional "out of scope,
may go stale until I6d" tradeoff); (8) a separate `targetFilesWritten`
count excludes the two metadata paths from the message's own count
(`filesWritten`'s existing JSON semantics untouched). Spec review passed
with only cosmetic notes (since fixed). Code-quality review found
ISSUES_FOUND: `runModelPolicyWrite`'s continued growth flagged as Important
- fixed by extracting the two largest new blocks into the two named helpers
above; a ternary-message-construction ambiguity flagged as Important - fixed
by adding both the disabled-Tabnine edge case and a clarifying comment.
Tests: `packages/core` 213/212, `packages/compiler` 312/311, `apps/cli`
545/541, all 0 failures; clean typecheck (including `tsconfig.test.json`)
on all three; `verify:pack` and golden regeneration both clean. All 8
findings resolved as GitHub review threads. State stays `ready`, not
`done` - same open acceptance criteria as noted above (mapping-v2-
adopting-v3 writes, "custom exact" strategy, interactive-UI triggering,
Tabnine reconciliation deferred to I6d).

I6a PR review fix round 9 (2026-07-21, PR #125), after I6a was already
marked `done`: addressed 4 new Codex bot findings (1 P1, 3 P2) on the same
`upgrade` write paths, all fresh evidence surfaced against round 8's own
fixes: (1, P1) the bulk-preset-switch preview (round 7) diffed against a
synthetic pre-strategy compile, not the file's actual on-disk bytes - for a
mixed-owned file this misrepresented preserved manual content as newly
added, and for a genuine `create` action it hid most of the file behind a
diff against the wrong baseline instead of the real empty-vs-planned one -
fixed by reading actual on-disk bytes (missing file treated as empty) for
the diff's "old" side, removing the `preStrategyFiles` parameter from the
preview function entirely (the manual-owned-bearing-path check, a
genuinely different question, still correctly uses the synthetic pre/post
comparison); (2, P2) the "repaired" success message (round 8) always said
a target file "had drifted", even for a missing-file repair, an unrelated
template regeneration, or a metadata-only lock change, and could read
"repaired 0 target files that had drifted" - fixed with neutral wording
that inspects the write-plan actions to distinguish created/regenerated/
metadata-only, never using the word "drift"; (3, P2)
`--model-policy-strategy ... --write` without `--adopt-recommended`
silently dropped the capability-catalog report (currently-offered
capabilities vanished from both text and JSON, even though the two upgrade
concerns are documented as independent) - fixed by threading the same
`recordedVersion`/`offeredIds` `runUpgrade` already computes into both the
"retain" no-op branch and `runModelPolicyWrite`'s real-write branch; (4,
P2) mapping-v2 "retain" always previewed "nothing to retain" even when a
real v3 `ai-profile.lock` `modelPolicy` block still exists (e.g. a user
removed `subagentPolicy.preset` without regenerating the lock - an
accepted repository state, not missing information) - fixed by passing
`lockfileView?.modelPolicy` instead of a hardcoded `undefined` for every
mapping-v2 strategy (safe for adopt/quality-first/cost-conscious too,
which only use "previous" for Tabnine-row preservation). One test-
construction bug found and fixed while testing finding 4: a hand-crafted
lock JSON with unsorted `modelPolicy.resolutions` failed schema validation
("not in deterministic order") - fixed by sorting via the already-exported
`compareModelPolicyResolutions` before writing the fixture, since (unlike
most fixtures in this file) it writes lock JSON directly rather than via
`buildLockfile`. Spec review passed COMPLIANT. Code-quality review found
ISSUES_FOUND, all four items fixed: a stale comment claimed the pre-
strategy compile was still "shared" with the preview (no longer true after
fix 1) - corrected to state the preview now deliberately uses on-disk
bytes instead; real duplication between the "retain" no-op branch and
`runModelPolicyWrite`'s final report (identical JSON shape and text line,
copy-pasted rather than extracted) - fixed via two new shared helpers,
`buildUpgradeCapabilityJsonFields` and
`printOfferedCapabilitiesUnrelatedToModelPolicyWrite`, mirroring the
existing `buildModelPolicyJsonFields` precedent for exactly this "shared
report fields, one owner" problem shape; broken indentation in the
three-way message block (hand-edited without reformatting) - fixed by
extracting it into a new named `formatModelPolicyWriteResultText` helper,
matching this function's own established decomposition pattern
(`findManualOwnedModelBearingChanges`, `refuseIfTabnineProvenanceWouldBeLost`)
instead of growing further inline; a test comment gap on the sort-fixture
fix - added. Tests: `apps/cli` 558/554, all 0 failures; clean typecheck
(including `tsconfig.test.json`); `verify:pack` and golden regeneration
both clean.

I6a PR review fix round 8 (2026-07-21, PR #125), after I6a was already
marked `done`: addressed 4 new Codex bot findings (2 P1, 2 P2) on the same
already-shipped `upgrade` write paths: (1, P1) model-policy writes were not
atomic - `createOrApplyWritePlan`'s real-apply path delegated to the plain
`applyWritePlan` (writes files one at a time), not `applyWritePlanAtomic`
(all-or-nothing), so a mid-write failure could leave `ai-profile.yaml`
updated while `ai-profile.lock` stayed stale, especially damaging since
`ai-profile.yaml` is first in the write array for a bulk preset switch -
fixed by giving `createOrApplyWritePlan` an `{atomic: true}` option, used
only at the model-policy write's real-apply call site (matching the same
precedent `configure.ts` already established for its own multi-file
mutation); (2, P2) the manual-owned "model-policy-bearing path" refusal
(from round 6) compared fresh compiled bytes against ON-DISK bytes, so a
manually-customized bearing file (e.g. a hand-edited Tabnine guideline)
always refused regardless of whether the selected strategy would have
touched it at all - fixed by comparing a PRE-strategy render (the
ORIGINAL profile reconciled against the prior lock) against the
POST-strategy render instead, so a path is only refused when the strategy
itself would change its content; (3, P2) `modelPolicyWrote` (from round 6)
was derived from `ai-profile.lock`'s own file-level write-plan action, but
that action covers the ENTIRE lock (generated-output hashes, template
metadata, the profile's own recorded sha256), not just the `modelPolicy`
block, so a lock-wide change unrelated to model resolution (e.g. an edited
profile description) still falsely reported a policy mutation - fixed with
a new `modelPolicyBlocksEqual` field-by-field structural comparison
against the prior on-disk lock's actual `modelPolicy` block; (4, P1) the
pre-apply preview (from round 7) showed only `path (action)` labels,
discarding the planned bytes entirely, so a user still could not review
the actual `ai-profile.yaml` splice or generated-file content being
accepted - fixed by rendering a semantic `subagentPolicy.enabled`/`.preset`
old->new line for the profile and a real line-level content diff (a new
`formatTextDiff` common-prefix/suffix-trim helper, documented as exact
only for the single-region edits this command actually produces) for
every other changed file. One pre-existing test had a genuine bug fixed
during this round: the ".codex/config.toml manual-owned" refusal test used
the "architect" role to build its stale fixture, but that file's
primary-default write only ever encodes `MODEL_POLICY_PRIMARY_ROLE`
("implementer") - the new pre/post-strategy comparison correctly exposed
that architect changes can never affect that file, so the test was fixed
to perturb "implementer" instead. Spec review passed (COMPLIANT-equivalent,
one disclosed non-blocking note: no CLI-level regression test directly
proves the atomic-write wiring itself, acceptable since `applyWritePlanAtomic`'s
rollback semantics are already independently unit-tested at the primitive
level and re-verifying that contract here is explicitly I6e's scope, not
I6a's). Code-quality review found ISSUES_FOUND, both items fixed: a
pre-strategy compile failure was silently degrading to an empty file list
instead of surfacing the problem - now refuses with the compile issues
printed, matching the existing post-strategy compile-failure precedent;
the manual-owned-bearing comparison loop was extracted into a named
`findManualOwnedModelBearingChanges` helper, matching the decomposition
pattern already established for `refuseIfTabnineProvenanceWouldBeLost` and
`previewBulkPresetSwitchWrites` in earlier rounds. Tests: `packages/compiler`
313/312 (unaffected), `apps/cli` 555/551, all 0 failures; clean typecheck
(including `tsconfig.test.json`) on both; `verify:pack` and golden
regeneration both clean.

I6a PR review fix round 7 (2026-07-21, PR #125), after I6a was already
marked `done`: addressed 6 new Codex bot P2 findings (a 7th was deliberately
deferred with documentation instead of fixed as code - see below) on the
already-shipped, already-reviewed `upgrade` write paths: (1)
`--adopt-recommended` combined with `--model-policy-strategy ... --write`
silently ran only the model-policy write and dropped the capability
adoption - now explicitly rejected as an unsupported combination rather
than silently applying one and ignoring the other; (2) `ai-profile.lock`
lost a preserved prior lock's `client: "tabnine"` rows during the ACTUAL
write compilation even though an earlier round's planner-level fix
preserved them in the PREVIEW - `resolveModelPolicyLockfile`
(`packages/compiler/src/model-policy-target-adapter.ts`) unconditionally
recomputed tabnine rows fresh (currently always empty) and discarded
`previousModelPolicy`'s tabnine rows; now falls back to them only when the
fresh computation is empty; (3) the JSON capability-insertion refusal
branch omitted the shared model-policy comparison fields even though text
mode already prints them first; (4) "retain" `--write` returned exit code
1 (refusal) instead of succeeding as a no-op, which would make automation
uniformly appending `--write` treat a deliberate no-op as a failure - now
returns 0 with a "Nothing to write" message/JSON shape; the now-provably-
unreachable trailing refusal was replaced with a defensive invariant throw;
(5) the manual-owned "model-policy-bearing path" refusal was still
over-broad - it refused for ANY manual-owned path in the allowlist
regardless of whether THIS specific write would actually change its bytes
(e.g. Tabnine's guideline depends only on preset/roles, which "adopt"
never changes) - now compares fresh compiled bytes against actual on-disk
bytes and only refuses on a genuine difference; (6) `modelPolicyWrote` (and
the success text) was derived from the aggregate written-file count, so a
write that only repaired a missing/drifted generated target file (with
`ai-profile.lock` itself unchanged) falsely reported the model policy as
mutated - now derived specifically from the lock's own action, with a
third text branch distinguishing "repaired a target file" from "actually
adopted/switched" and "nothing to do". Spec review passed COMPLIANT
(verified all 6 fixes against the actual diff, including exhaustiveness of
the new dispatch branches and that the byte-comparison fix reads the same
fresh bytes that would actually be written). Code-quality review found
ISSUES_FOUND, one Important item fixed: `resolveModelPolicyLockfile`'s own
JSDoc still described Tabnine rows as "unaffected" by `previousModelPolicy`
after the fix made that no longer true - updated the JSDoc itself (not
just an inline comment) to document the fallback and its "resurrected
until a real override source exists" tradeoff; one Minor item also fixed
(aligned the new unreachable-invariant throw's wording with this file's
existing precedent). The 7th finding (`lockedModelLifecycle` reporting
"unrated" for a locked model no longer present in the live catalog arrays,
losing whether it was actually retired) was deliberately NOT fixed as
code: it cannot occur in this project's real history today (both catalogs
contain only "current" entries so far), and the two candidate closures (a
regression test pinning today's catalog contents, vs. a new historical
registry) are a genuine narrow maintainer decision, not a bounded
implementation cycle - documented as `phase-31.9` item 2 (see that section)
plus a clarifying JSDoc addition, left unresolved on the PR rather than
silently closed. Tests: `packages/core` 213/212, `packages/compiler`
313/312, `apps/cli` 553/549, all 0 failures; clean typecheck (including
`tsconfig.test.json`) on all three; `verify:pack` and golden regeneration
both clean.

I6a marked `done` 2026-07-21. The brief's own acceptance criteria are now
fully met: cycle 12 (below) shipped the last write-path gap
(mapping-v2-adopting-v3), and "custom exact" - the one remaining item from
the brief's original five-strategy list - was formally descoped via a
dated amendment to `006a-upgrade-comparison-and-planning.md`'s own
Non-goals/Acceptance-criteria sections, not silently dropped. It is tracked
separately as `phase-31.9` (see that section above), pending a future grill
session; nothing in this item's approved acceptance bar remains open.

I6a twelfth RED-first cycle completed 2026-07-20, closing the last disclosed
write-path gap from prior cycles: `agent-profile upgrade
--model-policy-strategy adopt|quality-first|cost-conscious --write` now
writes for real on an enabled mapping-v2 profile too (`subagentPolicy.enabled
=== true && subagentPolicy.preset === undefined`), not just a v3-opted one.
The refusal message from cycle 11 had claimed mapping-v2 needed a new YAML
shape `planSubagentPolicyPresetEdit` didn't support - that claim was stale;
the helper already documented and handled "present-enabled-no-preset
(mapping-v2)" as one of its four starting shapes from cycle 10. The only
real gap was CLI wiring plus one semantic wrinkle: a v3-opted profile's
"adopt" keeps its current preset (no `ai-profile.yaml` edit needed), but a
mapping-v2 profile has no current v3 preset to keep at all, so even
"adopt" there resolves to a concrete preset (`DEFAULT_MODEL_POLICY_PRESET`,
"role-aware") that must be written for the first time - the same edit path
a bulk preset switch already used. A new `resolveModelPolicyWriteTargetPreset`
helper (extracted per code-quality review, replacing an initial
nested-ternary inline expression flagged as too dense to read without its
own six-line comment) resolves this per profile shape; `runModelPolicyWrite`
itself needed zero internal changes, confirmed by both implementation and
spec review by tracing that `planModelPolicyUpgrade` never returns an
undefined block for adopt/quality-first/cost-conscious (only "retain" can),
so the function's existing invariant-check throw can never trip for a
mapping-v2-sourced call. "Retain" still refuses on either profile shape (no
prior resolution to retain - unchanged from every earlier cycle). Spec
review passed COMPLIANT (traced the "zero internal changes" claim, the
`bulkPreset ?? DEFAULT_MODEL_POLICY_PRESET` fallback boundary, and that the
already-shipped v3-opted write paths are provably bit-for-bit unchanged).
Code-quality review found ISSUES_FOUND, one Important item fixed (the dense
nested-ternary `targetPreset` expression extracted into the named helper
above, with its explanatory comment moved onto the helper's own doc
comment). Tests: `packages/core` 213/212, `packages/compiler` 312/311,
`apps/cli` 548/544, all 0 failures; clean typecheck (including
`tsconfig.test.json`) on all three; `verify:pack` and golden regeneration
both clean. State stays `ready`, not `done` - only the "custom exact"
strategy (disclosed, pre-existing non-goal), interactive-UI triggering of
any `--write` path, and Tabnine reconciliation (deferred to I6d) remain
open against the brief's acceptance criteria.

I6a eleventh RED-first cycle completed 2026-07-20, also a disclosed partial
slice: wired `planSubagentPolicyPresetEdit` (built but unwired in cycle 10)
into the CLI, so `agent-profile upgrade --model-policy-strategy
quality-first --write` and `--model-policy-strategy cost-conscious --write`
are now real writes for a v3-opted profile - the last of the three
`--write` combinations cycle 10 flagged as still-missing. Generalized
`runModelPolicyAdoptWrite` (cycle 9) into `runModelPolicyWrite`, adding a
`targetPreset: ModelPolicyPreset | undefined` parameter (`undefined` keeps
"adopt" semantics unchanged - no `ai-profile.yaml` edit; a concrete preset
triggers `planSubagentPolicyPresetEdit`, re-validates the edited source via
`parseProfileYaml`, and threads the EDITED profile/bytes through the same
`compileProfile` -> `planRegionAwareWrites` -> `getProtectedGeneratedPaths`
-> manual-owned-model-bearing refusal -> `resolveTabnineModelSettings` ->
`buildCompileWrites` -> `createOrApplyWritePlan` pipeline cycle 9 built,
prepending `{path: "ai-profile.yaml", bytes: edit.source}` to the writes
array so the profile edit and the regenerated lock/target files land in
ONE atomic plan - never yaml-written-but-lock-stale or vice versa). Still
refuses: "retain" on a v3-opted profile (no guaranteed
`modelPolicyPlan.block`, not a bulk preset switch) and every strategy on a
mapping-v2 profile (adopting v3 there needs to ADD `subagentPolicy.preset`
via a different YAML shape than `planSubagentPolicyPresetEdit` assumes
exists - still a later cycle's scope). Spec review passed COMPLIANT.
Code-quality review found ISSUES_FOUND, one Important item fixed: three
refusal messages (drift, protected-paths, manual-owned) interpolated
`strategyLabel` into a verb slot that only reads correctly for "adopt"
(e.g. "Refusing to quality-first: ..."), a real user-facing regression from
generalizing the hardcoded "adopt" wording - reworded to a preset-agnostic
"Refusing to write (${strategyLabel}): ..." form, matching the pattern the
success/no-op messages already used correctly. Two Minor items also fixed:
a duplicated `"quality-first" || "cost-conscious"` predicate re-derived
inline instead of reusing the already-named `isBulkPresetSwitch` variable;
and a leftover single-element `for` loop in a narrowed test (dead ceremony
from when it covered three strategies). Tests: `packages/core` 213/212,
`apps/cli` 538/534, both 0 failures; clean typecheck on both; `verify:pack`
and golden regeneration both clean. State stays `ready`, not `done` - still
open: mapping-v2-adopting-v3 writes, the "custom exact" strategy
(disclosed non-goal), interactive-UI triggering of any `--write` path, and
the disclosed lifecycle-comparison gap from cycle 1.

I6a ninth RED-first cycle completed 2026-07-20, also a disclosed partial
slice, PLUS a fix pass responding to a Codex PR review (12 findings across
two rounds; see PR #125's resolved review threads for full detail):
restored `--model-policy-strategy adopt --write` for v3-opted profiles
ONLY, this time correctly - by reusing the exact same pipeline
`agent-profile compile --write` already uses (`compileProfile` ->
`planRegionAwareWrites` -> `getProtectedGeneratedPaths` ->
`resolveTabnineModelSettings` -> `buildCompileWrites` ->
`createOrApplyWritePlan`), seeded with the adopted plan's block as the
"previous" model policy so Phase 31.5 I6's own lock-reuse primitive makes
every regenerated Codex/Claude target file agree with the lock
automatically - fixing the exact defect (lock written, generated files
left stale) that got the write path removed entirely in the PR-review fix
pass. Every other combination (any strategy on mapping-v2; retain/
quality-first/cost-conscious on v3-opted) still refuses with the unchanged
message. Code-quality review found one Critical, real gap: the new
`runModelPolicyAdoptWrite` mirrored `planRegionAwareWrites`'s drift check
(AGENTS.md/CLAUDE.md only) but omitted `getProtectedGeneratedPaths`, the
SEPARATE check `runCompile` also performs for every other generated output
- meaning a hand-edited `.codex/config.toml` would have been silently
overwritten instead of refusing, contradicting the function's own doc
comment. Fixed before closing the cycle (added the check + a regression
test that corrupts `.codex/config.toml` in isolation and proves refusal).
`npm test`/`npm run check` clean for `apps/cli` (520 tests/516 pass/0
fail/4 unrelated skips) after the fix. Still left for later I6a cycles:
mapping-v2 writes and quality-first/cost-conscious writes (both need the
still-unbuilt `ai-profile.yaml` `subagentPolicy.preset` surgical edit),
the "custom exact" strategy (disclosed, pre-existing non-goal - re-flagged
by the same Codex review and deliberately left open, not a regression from
this PR), and the disclosed lifecycle-comparison gap from cycle 1. State
stays `ready`, not `done`.

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

I6a eighth RED-first cycle completed 2026-07-19, also a disclosed partial
slice: widened `--model-policy-strategy` preview (cycle 4's flag) to also
accept an enabled mapping-v2 profile, with zero new compiler-package code
- cycle 3's `planModelPolicyUpgrade` already produces the correct plan when
called as `planModelPolicyUpgrade(strategy, undefined, "role-aware")`
("adopt" targets the default v3 preset since mapping-v2 has no "current
preset" of its own; "retain" naturally yields `block: undefined`/"nothing
to retain", exactly right since mapping-v2 has no prior v3 lock). The
refusal message widened to name both accepted shapes (deliberate wording
change; the one stale test asserting the old exact string was updated, no
other test needed changes per a grep check). Added an UNCONDITIONAL
`--write` refusal for mapping-v2 across all four strategies, placed before
the existing quality-first/cost-conscious/adopt write logic, so `adopt
--write` on a mapping-v2 profile can never fall through to silently write
only the lock block without also updating `ai-profile.yaml`'s
`subagentPolicy.preset` (the exact "inert write" bug class cycle 5 already
guarded against for v3-opted quality-first/cost-conscious). Spec review
passed COMPLIANT and code-quality review passed ACCEPTABLE, both clean
single-pass reviews (no fixes needed) - one forward-looking, non-blocking
note: the `modelPolicyPlan` computation is now a three-level nested ternary
and should become a small named helper if a future cycle adds a fifth plan
shape. `npm test`/`npm run check` clean for `apps/cli` (520 tests/516
pass/0 fail/4 unrelated skips). Still left for later I6a cycles: actually
writing anything for a mapping-v2 profile (needs the deferred YAML
`subagentPolicy.preset` surgical edit - the same gap blocking
quality-first/cost-conscious writes for v3-opted profiles too), the
"custom exact" strategy, the entire interactive clack UI, and the
disclosed lifecycle-comparison gap from cycle 1. State stays `ready`, not
`done`.

I6a seventh RED-first cycle completed 2026-07-19, also a disclosed partial
slice: wired cycle 6's `compareModelPolicyUpgradeFromLegacy` into
`agent-profile upgrade`'s existing JSON/text report surface
(`apps/cli/src/index.ts`), the exact sibling of cycle 2's v3-opted
wiring - for an enabled mapping-v2 profile only. New
`isEnabledMappingV2Policy` type guard next to `hasV3ModelPreset`; a
`modelPolicyLegacyChanges` field/section (compared against
`DEFAULT_MODEL_POLICY_PRESET`, "role-aware") follows the same
omit/empty/populated three-state convention as `modelPolicyChanges`/
`modelPolicyPlan`, with a distinctly-worded text header ("model policy
changes (mapping v2 -> v3 preview):") so users can tell the two
comparison contexts apart. `modelPolicyChanges` and
`modelPolicyLegacyChanges` are mutually exclusive by construction and a
test proves it both directions. `--model-policy-strategy`'s existing
refusal for a mapping-v2 profile is unchanged (regression-tested) - this
cycle is comparison-report wiring only, no planning/write path for
mapping-v2. Spec review passed COMPLIANT (one non-blocking test-rigor
note: a refusal-message regex match instead of exact-string, matching an
existing sibling test's established convention). Code-quality review
passed ACCEPTABLE (one non-blocking note: `emitUpgradeReport` now takes 7
positional args across 3 call sites - a good options-object refactor
candidate for a future CLI-cleanup cycle, not this one). `npm test`/`npm
run check` clean for both `apps/cli` (517 tests/513 pass/0 fail/4
unrelated skips) and `packages/compiler` (303 tests/302 pass/0 fail/1
unrelated skip, sanity-checked though untouched). Still left for later
I6a cycles: the mapping-v2 planning/write path (needs to touch BOTH
`ai-profile.yaml`'s `subagentPolicy` block and the lock), any
`--model-policy-strategy` extension to mapping-v2, the "custom exact"
strategy, quality-first/cost-conscious writes, the entire interactive
clack UI, and the disclosed lifecycle-comparison gap from cycle 1. State
stays `ready`, not `done`.

I6a sixth RED-first cycle completed 2026-07-19, also a disclosed partial
slice: added `compareModelPolicyUpgradeFromLegacy`
(`packages/compiler/src/model-policy-legacy-upgrade-comparison.ts`), a
compiler-layer-only comparison helper for the OTHER profile shape the brief
requires: an enabled mapping-v2 profile (`subagentPolicy.enabled === true`,
no `preset` - Phase 30's legacy role-based resolver). Compares each v2
role's `resolveRoleMapping` output against what a target v3 preset's own
fresh table would resolve instead, over the full v3 role vocabulary
(`routine-implementer`, the one v3-only role with no v2 equivalent, reports
`legacy: undefined` and a distinct "no v2 equivalent" reason). Sibling in
structure to cycle 1's `compareModelPolicyUpgrade`. Spec review found one
Medium finding (the fresh-row capability-status precedence logic had been
copy-pasted rather than reused from cycle 1's file, exactly the drift risk
the task text warned about) and one Low finding (a test asserted "v2/v3
catalogs are disjoint" without actually verifying it) - both fixed before
code-quality review: `freshCapabilityStatus` is now exported from
`model-policy-upgrade-comparison.ts` and imported here instead of
duplicated; a new test iterates the real v2/v3 catalog constants and proves
disjointness rather than asserting it in a comment. Code-quality review
passed ACCEPTABLE (one non-blocking Minor: a `Set` wrapping a 9-element
array for a single-use membership check, unnecessary but not wrong).
Re-ran `npm test`/`npm run check` for both `packages/compiler` (303
tests/302 pass/0 fail/1 unrelated skip) and `apps/cli` (513 tests/509
pass/0 fail/4 unrelated skips) after the fixes: both clean. Still left for
later I6a cycles: any CLI wiring for the legacy comparison (mirrors cycle
1->2's own gap before it was wired in), planning/write paths for a
mapping-v2 profile adopting v3 (needs to touch BOTH `ai-profile.yaml`'s
`subagentPolicy` block and the lock, not just the lock), the "custom exact"
strategy, quality-first/cost-conscious writes (needs the deferred YAML
preset surgical edit), the entire interactive clack UI (nothing in I6a so
far is reachable outside the explicit `--model-policy-strategy` flag), and
the disclosed lifecycle-comparison gap from cycle 1. State stays `ready`,
not `done`.

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

## phase-31.9: Upgrade "custom exact" model-policy strategy (`docs/specs/phase-31.9/001-upgrade-custom-exact-strategy.md`)

Descoped from Phase 31.5 I6a on 2026-07-21 (see I6a's own brief amendment):
the "custom exact" per-role/per-client planning path was the only one of
five originally-listed I6a strategies never implemented, repeatedly flagged
by automated PR review and consciously deferred each round since it needed
a materially larger, undecided design (a nested per-role/per-client
`ai-profile.yaml` edit surface, a scripted-write input shape, and several
open product-shape questions) rather than a bounded implementation cycle.
The linked document is a findings/problem record only, not an approved spec
- it captures what already exists (the shared `SubagentPolicyRoleOverrides`
schema, both comparison helpers' existing `roleOverrides` support) and the
open design questions a future grill session needs to resolve (input shape,
whether it composes with a bulk strategy, persistence target, mapping-v2
interaction, validation strictness, interactive UX scope).

| Id | Task                                                       | State       | Brief                                                                                                     |
| -- | ----------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------- |
| 1  | Grill session: upgrade "custom exact" strategy design       | human-gate  | [001-upgrade-custom-exact-strategy.md](docs/specs/phase-31.9/001-upgrade-custom-exact-strategy.md)         |
| 2  | Maintainer decision: catalog lifecycle history retention     | human-gate  | [002-catalog-lifecycle-history-retention.md](docs/specs/phase-31.9/002-catalog-lifecycle-history-retention.md) |

Item 2 (added 2026-07-21): raised by Codex bot PR review on PR #125 -
`lockedModelLifecycle` (`packages/compiler/src/model-policy-upgrade-comparison.ts`)
reports "unrated" for a locked model id no longer present in the live
catalog arrays, which would be wrong if that model was actually retired
rather than never-published. This cannot occur in this project's real
history today (both catalogs contain only `"current"` entries so far), and
the existing spec already documents the required discipline ("once
published, remains in compatibility history" - never delete, only mark
retired). Not fixed as code, since the two candidate closures (a
regression test pinning today's catalog contents, vs. a new historical
registry) are a narrow but genuine maintainer decision, not a bounded
implementation cycle. Left unresolved on the PR (not silently closed);
documented as a clarifying code comment plus this findings record.

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
