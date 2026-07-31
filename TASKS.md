# Task Ledger

Index only - task content lives in the linked issue briefs.
States: `ready | blocked | sequenced | parallel-safe | human-gate | in-progress | done`

## phase-11: Subagent Targets (`docs/specs/phase-11/001-subagents-schema.md`)

Shipped before the issue-brief convention; this section exists to carry
defects found against its target specs.

| Id  | Task                            | State | Brief                                                                                                       |
| --- | ------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------- |
| I1  | Codex subagent execution bounds | ready | [001-codex-subagent-execution-bounds.md](docs/specs/phase-11/issues/001-codex-subagent-execution-bounds.md) |

I1 raised 2026-07-31 from phase-33 work. `001-subagents-schema.md` lists
`maxTurns` and `timeoutMinutes` as target-neutral compilation inputs that the
three target specs consume; `002` maps `maxTurns` to Claude frontmatter and
`004` to Tabnine `max_turns`, but `003`'s mapping table has no row for either
and its Non-Goals do not mention them, so both are schema-accepted and then
dropped with no output and no note. Found while capping the change-risk
reviewer's turns: the cap reaches Claude only, so a Codex reviewer run is
unbounded by that mechanism. `ready` rather than `human-gate` because the
branch is decided by a fact - whether current Codex documentation defines a
per-agent bound - not by a product preference: map it if it exists, declare it
unsupported and emit the existing not-generated note if it does not. The brief
forbids inventing a Codex key name.

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

| Id  | Task                                                     | State      | Brief                                                                                                   |
| --- | -------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------- |
| I1  | Lockfile-first classification in the import report       | done       | [001-lockfile-first-classification.md](docs/specs/phase-27/issues/001-lockfile-first-classification.md) |
| I2  | Capability catalog + `upgrade.catalogVersion` provenance | done       | [002-capability-catalog-provenance.md](docs/specs/phase-27/issues/002-capability-catalog-provenance.md) |
| I3  | `upgrade` command: wizard, insertion editor, report mode | done       | [003-upgrade-command.md](docs/specs/phase-27/issues/003-upgrade-command.md)                             |
| I4  | Compile drift classification flow                        | done       | [004-drift-reconciliation-flow.md](docs/specs/phase-27/issues/004-drift-reconciliation-flow.md)         |
| I5  | Flow guidance conformance patch (0.4.3)                  | done       | [005-flow-guidance-conformance.md](docs/specs/phase-27/issues/005-flow-guidance-conformance.md)         |
| I6  | No-args interactive dispatcher                           | done       | [006-no-args-dispatcher.md](docs/specs/phase-27/issues/006-no-args-dispatcher.md)                       |
| I7  | Dispatcher follow-up offers + doctor/upgrade clarity     | done       | [007-dispatcher-follow-up-clarity.md](docs/specs/phase-27/issues/007-dispatcher-follow-up-clarity.md)   |
| I8  | Untracked generated-ownership rule                       | human-gate | [008-untracked-generated-ownership.md](docs/specs/phase-27/issues/008-untracked-generated-ownership.md) |

I3 and I4 are parallel-safe apart from shared `apps/cli/src/index.ts`
touchpoints; coordinate merges (if I3 lands first, rebase I4 onto it).

Unblocked 2026-07-07 (twice): first amendment authorizes the minimal
manual-owned branch in `planRegionAwareWrites`; second amendment
redefines parity - category equality for lockfile-backed rows, an
expected-pair table for no-entry rows (the markerless divergence is the
phase-14 consent-gated adoption design, not a bug). No further behavior
change authorized.

Conformance fix 2026-07-30, no new spec: `compile --target <id> --write`
rebuilt `ai-profile.lock` from the scoped compile result alone, dropping every
other target's templates and outputs (observed on PR #140: 27 entries to 5,
reported only as `[change] ai-profile.lock`). No new contract was written
because an approved one already governs it. Phase-05/001 says compile "removes
from the new lockfile" the outputs a previous compile produced that are "no
longer in the current compile result" - a rule about paths the PROFILE stopped
generating. A target the run never requested is not orphaned, and dropping it
strands its files on disk with no recorded ownership, which phase-14/001's
proof order ("lockfile v2 ownership" first), phase-05's first-write refusal,
and phase-27's own parity table all read. Phase-27's binding amendment already
states the principle for one case: "The rebuilt lockfile retains the
`manual-owned` entry for the path - it is never dropped or reclassified by
compile." The scoped run now carries untouched targets' entries forward; an
unscoped run passes nothing and rebuilds in full, so genuine orphan pruning is
unchanged. The implementation seam is `buildCompileWrites`'s new optional
`scopedTargets`, wired only from `runCompile` where `--target` is parsed;
this run's own entries always win, so a scoped compile can never resurrect a
stale record for a path it just regenerated. One adjacent defect was fixed
because the primary fix could not be correct without it: the lockfile patch
block sorted outputs with `localeCompare` while `createLockfileFile` sorts by
byte order, and the two disagree (ICU orders `change-risk-reviewer.md` after
`code-quality-reviewer.md`; byte order puts it first). Any compile routed
through that block therefore emitted a different row order than a plain
compile - churn against phase-01/003's determinism contract, and drift the next
unscoped compile would rewrite. Both now use byte order. Verified end to end: a
real `compile --target claude-subagents --write` against this repository is now
byte-identical to the full-compile lockfile. CLI suite 608 tests, compiler 482,
0 failures; root `npm run check` clean; the release journey test still fails
only on this machine's `tar`. Not done here: no formal spec amendment was
filed, since amending an approved spec is human-gated - if the retention rule
should be stated explicitly rather than derived, that is a grill decision.

Follow-up 2026-07-31, from the change-risk review of that fix (first run of the
reviewer as a native subagent): the preservation had been wired into one of two
reachable write paths. `runCompile` can hand off to `runDriftReconciliation`,
which calls `buildCompileWrites` itself and RETURNS before `runCompile`'s own
call is reached, so a scoped `--write` that hit interactive drift
reconciliation still rebuilt the lock from the partial result - the same
ownership violation, still live, and live specifically on the path where the
user has just classified their edits and is most likely to accept the write.
The reviewer's reachability proof is the part the hand investigation missed:
`runCompile` already forwards `includeTabnine: parsed.targets.length === 0`
into that branch, so the entry point demonstrably knows the run may be scoped
and dropped the provenance anyway; and the first regression test only drove the
non-interactive path, so nothing covered it. `scopedTargets` is now computed
once in `runCompile` before the reconciliation branch and handed to both call
sites, so they cannot diverge again. Audited the remaining callers: only
`runCompile` passes `targets` to `compileProfile` at all - upgrade, init,
`configure`, and `dispatch` compile every target - so the value correctly stays
undefined there. CLI suite 609 tests, compiler 482, 0 failures; root
`npm run check` clean; a real scoped compile against this repository remains a
byte-exact lockfile no-op.

Disclosed defect in the reviewer artifact itself, not in the code it reviewed:
its envelope would not pass `validateChangeRiskResultV1`. It emitted
`scope.domains[].state` for `applicability`, `manifestCovered` for
`inspectedChangeManifest`, `invalidatesPriorFinding: false` on evidence for
`fixed` findings (the contract requires that marker absent except on a
`false-positive` closure), and re-labelled a prior P2 as P1. A real
orchestration would classify that as a malformed attempt and spend a transient
retry, so the prompt's result-contract section is not yet producing a
conformant envelope. Not fixed here; it belongs with I1's reviewer prompt.

Both reviewer-artifact defects fixed 2026-07-31 against I1's prompt, as
conformance with the parent spec's typed reviewer interface rather than new
scope. Envelope: the Result Contract described the scope block in prose
("records `completed`, manifest coverage, relevant-consumer inspection") and
never named a single key, so a reviewer following it invented plausible
synonyms - the observed run emitted `state` for `applicability` and
`manifestCovered` for `inspectedChangeManifest`. The projection now carries
`scopeFields`, `domainEntryFields`, and `domainApplicabilityValues`, and the
prompt renders the exact keys with the reason they are exact. It also states
the absence rule the validator already enforces: `invalidatesPriorFinding` is
absent for `open`, `fixed`, and `obsolete`, and emitting it as `false` is
still emitting it. Guarded by a mutation test rather than string matching -
each projected scope key is renamed in a valid envelope and validation must
reject it, so the prompt cannot drift from the validator without failing.
Turn cap: the reviewer had a hardcoded `maxTurns: 10` while `spec-reviewer`
and `code-quality-reviewer` - which inspect strictly less, one task's diff
against a spec - had 18. The change-risk reviewer reads the complete
accumulated change, reachable unchanged consumers, its own 157-line domain
reference, and runs tests for runtime evidence. The budget is now derived from
the read-only peer template, so it cannot silently fall below its narrower
peers again, and the emission test asserts that relation rather than the
number. Observed cost of the old cap: the first native-subagent run exhausted
10 turns mid-inspection and returned no envelope at all, which an
orchestration can only classify as an invalid attempt; it produced the result
only after a manual resume. Correction to the earlier note: of the four
deviations reported, three are contract violations and the fourth (a prior P2
re-reported as P1 on remediation) is not - the fingerprint deliberately
excludes priority, and no approved clause pins priority across rounds, so
calling it non-conformant was wrong. Scope limit worth stating: the Codex
agent surface carries no turn-budget key at all, so this cap is Claude-only
and a Codex reviewer run is unbounded by this mechanism. Golden fixtures
regenerated via `scripts/regen-golden-fixtures.mjs` (reviewer artifacts and
their lock entries only); compiler suite 484 tests, 0 failures; root
`npm run check` and `verify:pack` clean.

Review round 2026-07-31 on those fixes returned `NEEDS_CONTEXT`, which is the
contract working rather than failing: the reviewer exhausted its budget and
refused to report an unfinished review as complete. It closed the prior
`runDriftReconciliation` fingerprint as `fixed` on its own evidence (one call
site, both write paths carrying `scopedTargets`) and raised one P3, now fixed:
the turn budget derived from `spec-reviewer` alone while its comment claimed
protection against every narrower peer, so raising `code-quality-reviewer`
would have silently left the broader reviewer behind. It now derives from the
maximum over every read-only template - the property that makes them peers,
not a hand-listed name - and the emission test asserts against each peer. The
emitted value is unchanged at 18, so no fixture churn.

Its highest-value output was a `missingInputs` entry, not a finding: it could
not verify that the CLI `--target` vocabulary matches the lockfile `target`
vocabulary, and reasoned that if they ever diverged, `requested.has(target)`
would never match and the scoped-preservation fix would INVERT phase-05's
pruning rule - resurrecting orphans inside a requested target instead of
pruning them. Checked: they match today (every lockfile target is a valid
`CompilerTargetId`; `tabnine` is the one deliberate non-member and is meant to
carry forward). Nothing pinned them, so a regression test now seeds a fake
orphan inside the requested target and requires it to still be pruned, and the
guard was mutation-proven by simulating the divergence and watching it fail.
The remaining four `missingInputs` were closed by hand and are recorded as the
implementer's evidence, not independent clean-room verification: runtime proof
(suites run), fixture delta (exactly three lines - the budget and the two
prompt lines), published seam (`packages/compiler/src/index.ts` and
`fixtures/npm-pack/` untouched this round), and other `resultInterface`
consumers (exactly one; the orchestration module has zero references).

Turn cap: still UNRESOLVED, and the earlier "fixed" claim was wrong. Raising
10 to 18 was the right relative correction but treated a symptom; this run
truncated at 18 exactly as the previous one truncated at 10. The cause is
structural. The reviewer's clean-room contract forbids a prior finding list or
implementer report, so every round re-reads the whole change from scratch
while the accumulated diff grows past 90 files and the budget stays fixed. No
constant survives that, and the failure mode is the worst available: it
returns no envelope at all, which an orchestration can only classify as an
invalid attempt and retry into the same wall. The fix belongs to the
orchestration - invoke the reviewer against a bounded snapshot rather than an
ever-growing accumulated diff, which is what the manifest-first context and
the `NEEDS_CONTEXT` escape were designed for and what I6 exists to validate -
so it is deliberately not patched with another number here. CLI suite 610
tests, compiler 484, 0 failures; root `npm run check` clean.

I8 raised 2026-07-31 from phase-33 work, `human-gate` because it is a product
decision rather than a defect with one correct fix. Two lockfile outputs -
`.mcp.json` and `.codex/config.toml` - are `generated-owned`, gitignored, and
untracked at once. `.gitignore` calls them local runtime deliberately while the
tracked `ai-profile.lock` records a sha256 for each, so on a fresh clone the
recorded hash describes bytes no other checkout has and the proof order's first
step cannot confirm ownership. Found the destructive way: a hand-authored
`.mcp.json` holding a local MCP server definition survived
`compile --write --force` only because it had been backed up first - the file is
untracked, so git could not have restored it. The hash-mismatch refusal did
fire, which is the guard working; `--force` is the hole. Either the ignore
entries are wrong and these are ordinary tracked artifacts, or the lockfile
should stop hashing locally-materialised outputs; the brief refuses to pick
inside an implementation slice and requires a grill. Acceptance includes an
enumeration test asserting no output is ever again `generated-owned` +
gitignored + untracked, so the state cannot return silently.

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

| Id  | Task                                                                         | State | Brief                                                                                                                                 |
| --- | ---------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------- |
| I1  | Shared model-policy domain and compatibility resolver                        | done  | [001-shared-model-policy-domain.md](docs/specs/phase-31.5/issues/001-shared-model-policy-domain.md)                                   |
| I1R | Complete v3 profile-schema integration                                       | done  | [001r-v3-profile-schema-integration.md](docs/specs/phase-31.5/issues/001r-v3-profile-schema-integration.md)                           |
| I2  | Codex and Claude exact model adapters                                        | done  | [002-codex-claude-model-adapters.md](docs/specs/phase-31.5/issues/002-codex-claude-model-adapters.md)                                 |
| I3  | Tabnine historical, organization, and private models                         | done  | [003-tabnine-historical-private-models.md](docs/specs/phase-31.5/issues/003-tabnine-historical-private-models.md)                     |
| I4  | Consented source-free model probes                                           | done  | [004-consented-source-free-probes.md](docs/specs/phase-31.5/issues/004-consented-source-free-probes.md)                               |
| I5  | Exact role-aware model selection during init                                 | done  | [005-init-model-selection.md](docs/specs/phase-31.5/issues/005-init-model-selection.md)                                               |
| I5R | Tabnine write-plan wiring, advanced override entry, and model-selection docs | done  | [005r-tabnine-write-wiring-and-advanced-override.md](docs/specs/phase-31.5/issues/005r-tabnine-write-wiring-and-advanced-override.md) |
| I6  | Locked model-resolution reuse primitive (ordinary compile reuses the lock)   | done  | [006-upgrade-and-lock-resolution.md](docs/specs/phase-31.5/issues/006-upgrade-and-lock-resolution.md)                                 |
| I6a | Upgrade command exact comparison and retain/adopt/customize planning         | done  | [006a-upgrade-comparison-and-planning.md](docs/specs/phase-31.5/issues/006a-upgrade-comparison-and-planning.md)                       |
| I6b | Metadata-only package/registry update check                                  | done  | [006b-metadata-only-registry-check.md](docs/specs/phase-31.5/issues/006b-metadata-only-registry-check.md)                             |
| I6c | Upgrade-flow probe consent, separate from update-check consent               | done  | [006c-probe-consent-separation.md](docs/specs/phase-31.5/issues/006c-probe-consent-separation.md)                                     |
| I6d | Tabnine model-resolution reconciliation                                      | done  | [006d-tabnine-lock-reconciliation.md](docs/specs/phase-31.5/issues/006d-tabnine-lock-reconciliation.md)                               |
| I6e | Upgrade write ownership refusal and rollback                                 | done  | [006e-upgrade-write-rollback.md](docs/specs/phase-31.5/issues/006e-upgrade-write-rollback.md)                                         |
| I7  | Offline Doctor model policy and explicit recheck                             | done  | [007-doctor-model-policy.md](docs/specs/phase-31.5/issues/007-doctor-model-policy.md)                                                 |
| I8  | Local UI model policy and user documentation                                 | done  | [008-local-ui-and-model-docs.md](docs/specs/phase-31.5/issues/008-local-ui-and-model-docs.md)                                         |
| I9  | Published model-selection journey and final integration                      | done  | [009-published-model-journey.md](docs/specs/phase-31.5/issues/009-published-model-journey.md)                                         |

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

I6b first RED-first cycle completed 2026-07-21, a disclosed partial slice:
added `apps/cli/src/update-check.ts` (`checkForPackageUpdate`,
`formatUpdateCheckMessage`, `manualUpdateGuidance`) and a new `upgrade
--check-for-updates` flag (off by default, separate from I6c's still-not-built
probe consent) that performs one read-only `fetch` against the npm registry's
package-metadata endpoint, reports newer/current/older/unknown plus manual
`npm install -g @agent-profile/cli@latest` guidance, and never
installs/downloads/writes anything. Declining (the default) performs zero
network access, proven via the existing `withNetworkSentinel` fixture reused
from `apps/cli/src/upgrade.test.ts`'s established pattern. `--json` mode
currently no-ops the check entirely (documented in code comments and
`--help` text) rather than integrating it into the JSON envelope - an
explicit, disclosed scope choice, not an oversight. Implementer initially
wrote the implementation before the tests (a process deviation from this
repo's required RED-first TDD workflow) but disclosed this rather than
hiding it; asked to correct it, the implementer then verified a real RED by
stashing the implementation, confirming the two behavior-driving tests failed
with "Unknown option: --check-for-updates" against the pre-change code, and
restoring to reconfirm green - so the ledger's RED->GREEN proof is genuine,
just not achieved in the originally-intended writing order. Spec review
passed COMPLIANT: verified in the code (not just claimed) that fetch
failures, non-OK responses, malformed JSON, and a missing/wrong-typed
`version` field are all caught and degrade to an `"unknown"` status rather
than throwing (a 5s `AbortController` timeout also guards against a hang), and
that no auth headers/credentials/telemetry are sent. Code-quality review
passed ACCEPTABLE with two non-blocking Minor notes (a slightly dense
`"version" in body ? ... : undefined` extraction, and an unreachable
exhaustiveness-guard `default` case that could use a clarifying comment) -
left as-is, not blocking. Tests: `apps/cli` 563/559 (0 fail, 4 pre-existing
skips); clean typecheck (`tsc -b` + `tsconfig.test.json --noEmit`). Deferred,
per spec review's own recommendation, as near-term follow-up rather than
blocking this cycle: dedicated tests for the `unknown` (timeout/malformed-
response) and `older` status branches (the code paths themselves were
verified sound by direct reading, satisfying AGENTS.md's own "static-only
evidence is weaker than a regression test" standard as a disclosed gap, not
an unmet criterion); and a real decision on `--json` mode integration versus
formally rejecting the flag combination. State stayed `ready`, not `done`
pending that follow-up.

I6b second RED-first cycle completed 2026-07-21, closing all three items
deferred above: (1) added a malformed (non-JSON) registry-response test and a
thrown-fetch-error test, both proving the `"unknown"` status degrades to a
"Could not check for updates" message with exit code 0, never a hard
failure; (2) added an older-version test (registry reports `0.0.1` against
the real running `0.5.0`), confirming `compareVersions` correctly yields
`"older"`; (3) made the `--check-for-updates`/`--json` interaction an
explicit product decision - rejects the combination outright (exit code 2),
matching this command's existing flag-conflict-rejection precedent, rather
than the silent no-op cycle 1 shipped - with help text/comments updated to
match. RED verified honestly this time: before implementing the `--json`
rejection, the two unknown/older tests already passed against cycle 1's
code (proving those branches were already sound, just untested) while the
new `--json`-rejection test failed with `0 !== 2` as expected. Spec review
found one remaining gap: no test isolated the `AbortController` timeout
mechanism itself from a generic thrown-fetch-error (both hit the same catch
block, but the acceptance criteria names "timeout" specifically). A third
small cycle closed it: added a test-only `updateCheckTimeoutMs` seam
(`CliOptions`/`RunUpgradeOptions` in `apps/cli/src/index.ts`, following the
same precedent as the existing `probeRunner` test seam, production default
of 5000ms in `update-check.ts` untouched for real callers) and one new test
whose `fetch` stub only rejects via a real `AbortSignal` "abort" event,
never resolving/rejecting on its own, proving the timeout wiring itself
fires the abort rather than merely re-exercising the generic catch block.
Spec review passed COMPLIANT across all three cycles combined, with every
acceptance-criteria bullet in the brief now traced to a specific regression
test (not static-only evidence). Code-quality review passed ACCEPTABLE both
times (cycle 2 had no findings beyond the flagged gap already handled by
cycle 3; cycle 3 had only two non-blocking Minor notes - a small doc-comment
duplication versus the `probeRunner` precedent, and a mildly redundant
double-assertion in the new test - left as-is). Tests: `apps/cli` 568/564,
0 failures, 4 pre-existing skips; clean typecheck (`tsc -b` +
`tsconfig.test.json --noEmit`). State moves to `done` - the brief's full
acceptance-criteria list is now backed by regression tests. Not carried
forward as open scope: `README.md`'s "Upgrading existing profiles" section
still doesn't mention `--check-for-updates` (same disclosed, pre-existing
gap pattern as I6a's own `--model-policy-strategy` omission - a
documentation-polish item, not a behavior gap).

I6c completed 2026-07-22 via one RED-first `/implement-next` cycle (plus one
code-quality follow-up round). Added a new `--probe-models` boolean flag to
`upgrade`, scoped to the `--model-policy-strategy adopt|quality-first|
cost-conscious --write` path (the only shipped "role-aware Adopt" path with a
concrete candidate-model list, since I6a's "Custom-exact" strategy was
formally descoped and never shipped - probing `--adopt-recommended`'s
capability rows would have required inventing new candidate-derivation logic
beyond this brief's own non-goals). Reuses I4's `buildModelProbePlan`/
`runModelProbe` unchanged (no reimplementation) via a new
`buildUpgradeModelProbeSelections` helper restricted to
`MODEL_POLICY_PRIMARY_ROLE`'s codex/claude candidates, mirroring `wizard.ts`'s
existing I5 restriction. The probe result surfaces only as an advisory text
line and an advisory `modelProbe` JSON field for that single run; it is never
merged into the write plan, `ai-profile.lock`, or `ai-profile.yaml`. Added a
new exported `modelPolicyEffortFromTargetEffort` in
`packages/compiler/src/model-policy-target-adapter.ts` (a thin public wrapper
over an existing private reverse-effort table) so the CLI could convert a
locked row's target-shaped effort back to the vocabulary `model-probe.ts`
requires. RED proof: 3 of 5 new tests failed against pre-change code with
"Unknown option: --probe-models" before the flag existed. GREEN proof: 5 new
tests in `apps/cli/src/upgrade.test.ts` prove all four accept/decline
combinations of `--probe-models` x `--check-for-updates` are independent via
separate fetch/process-runner spies, zero probe processes run on decline, and
a non-persistence test greps the actual written `ai-profile.lock`/
`ai-profile.yaml` files for `probe` and finds nothing. `--probe-models` +
`--json` is deliberately not rejected (unlike `--check-for-updates` + `--json`,
which has a genuine report-shape conflict): the advisory field composes
cleanly into the existing JSON envelope with no such conflict. Spec review
passed COMPLIANT. Code-quality review found one Important item - the new
probe-offer block was left inline in the already-large `runUpgrade` function
instead of following this task's own established extraction precedent
(`refuseIfTabnineProvenanceWouldBeLost`, `findManualOwnedModelBearingChanges`,
`previewModelPolicyWrites`) - fixed by extracting a named
`runConsentedUpgradeModelProbe` helper; a Minor duplicated-comment
nice-to-have was also addressed by consolidating the "advisory-only, never
persisted" explanation to one doc comment referenced from the other call
sites. Tests after the fix: `apps/cli` 576/572, 0 failures, 4 pre-existing
skips; `packages/compiler` 313/312, 0 failures, 1 pre-existing skip;
`packages/core` 213/212, 0 failures, 1 pre-existing skip; clean typecheck
(`tsc -b` + `tsconfig.test.json --noEmit`) across all workspaces. Not carried
forward as open scope: README's pre-existing `--check-for-updates`/
`--model-policy-strategy` documentation gap (unrelated to this cycle, already
disclosed by I6b/I6a).

I6d completed 2026-07-22 via one RED-first `/implement-next` cycle. Closed the
brief's own disclosed prerequisite gap first: added a persisted, schema-backed
`tabnine` per-role override (`SubagentPolicyTabnineRoleOverride`, model-only,
no effort field - Tabnine has no confirmed effort control) to
`SubagentPolicyRoleOverrides` in `packages/core/src/profile.ts`, threaded
through `resolveEffectiveSubagentPolicy`, unconditional
`isValidOpenModelPolicyOverride` validation (no `isV3OptIn` gate - there is no
legacy v2 Tabnine precedent to preserve), `buildSubagentPolicyDoc` emission,
and a new `subagentPolicyTabnineRoleOverride` JSON Schema definition
referenced from `subagentPolicyRole.overrides.tabnine`. Extended the base I6
"ordinary compile reuses the lock" mechanism to Tabnine: added
`deriveLockedTabnineOverride` (Tabnine twin of
`deriveLockedClientOverride`) and a `previousModelPolicy?` parameter on
`buildModelPolicyTabnineTargetTable`
(`packages/compiler/src/model-policy-tabnine-adapter.ts`), with the same
same-preset/non-explicit-override-source reuse gate; added a per-row
`catalogVersion` field to `ModelPolicyTabnineResolution` so
`toLockModelPolicyTabnineResolutions` stamps each row's own fresh-vs-reused
version instead of always-current. `resolveModelPolicyLockfile`
(`model-policy-target-adapter.ts`) now derives a `ModelPolicyTabnineRoleOverrides`
map (via a new `tabnineModel?` field on `ModelPolicyRoleOverrides`, kept
deliberately separate from the Codex/Claude-only `overrides` record) and
passes it plus `previousModelPolicy` through; this required removing the old
block-level "preserve every previous tabnine row when fresh is empty"
fallback, since it had no preset-match or per-role staleness check and would
have silently reintroduced the same "changed preset still reuses" /
"removed override still perpetuated" bug class the base I6 fix closed for
Codex/Claude - the new per-role reconciliation fully subsumes it, confirmed
by updating one pre-existing test that had encoded the old (incorrect)
contract. RED proof: 2 of 5 new `packages/core` validation tests failed
(unknown-key schema rejection, override lost on round-trip) and 3 of 5 new
`packages/compiler` reconciliation tests failed (explicit override, changed
preset, and removed override all wrongly reused the stale prior row) against
pre-change code. GREEN proof: new
`packages/compiler/src/model-policy-tabnine-lockfile-reuse.test.ts` (5 cases
mirroring the existing Codex/Claude parity suite) plus a new
`packages/core/src/subagent-policy.test.ts` validation block. Spec review
passed COMPLIANT, verifying real behavioral parity (not just structural
similarity) against the Codex/Claude mechanism and confirming
`.tabnine/agent/settings.json` ownership/write semantics
(`planTabnineModelSettingsWrite`) and `model-policy-upgrade-comparison.ts`
(I6a's owned file, still hardcodes `["codex","claude"]`) were untouched, per
this brief's own non-goals. Code-quality review's only flagged item - an
embedded raw NUL byte detected in `packages/core/src/subagent-policy.test.ts`

- was traced to line 621, a pre-existing Codex control-character test
  predating this diff entirely (confirmed via `git diff`), not something this
  cycle introduced; no fix needed. Tests: `packages/core` 218/217 (1
  pre-existing skip), `packages/compiler` 318/317 (1 pre-existing skip),
  `apps/cli` 580/576 (4 pre-existing skips), `packages/scanner`+`packages/doctor`
  88/88, all 0 failures; `npm run check` (incl. `tsconfig.test.json` and
  `svelte-check`) and `npm run verify:pack` both clean. Not carried forward as
  open scope, per this brief's own explicit non-goal: `model-policy-upgrade-comparison.ts`
  does not yet surface Tabnine rows in I6a's upgrade table - that remains I6a's
  scope, unchanged by this cycle.

I6e completed 2026-07-23 via one RED-first `/implement-next` cycle. AC1
(unowned/drifted target-file refusal parity with `compile`) and AC4
(declining at the final confirmation writes nothing) were already covered by
tests built during I6a's PR review rounds, confirmed still intact rather than
re-derived. The genuine gap this cycle closed was AC2: the older,
insertion-only `agent-profile upgrade` write path (ADR 0009 - the plain
`upgrade`/`upgrade --write --adopt-recommended` flow that inserts offered
capability-catalog entries into `ai-profile.yaml`, distinct from I6a's
`--model-policy-strategy` write path) wrote `ai-profile.yaml` and
`ai-profile.lock` together via the plain, non-atomic `applyWritePlan` (a
sequential per-file `writeFile` loop with no staging or rollback) instead of
the atomic `applyWritePlanAtomic` machinery I6a's write path already uses -
so a failure between the two writes could leave the repo inconsistent (e.g.
the lock stamped with a new `catalogVersion`/`sha256` while the profile
write failed and reverted). Fixed by switching that one call site
(`apps/cli/src/index.ts`'s `runUpgrade`, ~line 1394) to the existing
`createOrApplyWritePlan(rootDir, writes, true, io, { atomic: true })` helper

- already used by the model-policy write path - introducing no new write-plan
  mechanism. RED proof: forcing `fsPromises.writeFile` to fail on
  `ai-profile.yaml` against the pre-fix code showed `ai-profile.lock` commit
  with the new `catalogVersion`/`sha256` while `ai-profile.yaml` reverted, a
  genuine cross-file inconsistency; a second RED check (forcing
  `fsPromises.rename` to fail) showed the pre-fix code never engaged any
  atomic/rollback machinery at all (silently exited 0). GREEN proof: a new
  rename-forced-failure regression test in `apps/cli/src/upgrade.test.ts`
  (~line 1192) proves the fixed path exits 1 and restores both files to their
  pre-transaction bytes; a second new test proves the mocked `writeFile` is
  never invoked for either target path post-fix (a real regression guard
  against reverting to the plain writer, not just a success-path check); a
  third new test proves declining at `confirmWrite` writes nothing (AC4,
  already-correct pre-existing behavior, now covered). Spec review found one
  Medium issue - the first new test's name/comments overstated what it proved
  (it didn't exercise any failure) - fixed by rewriting it to assert on mock
  invocation counts instead of the success path, making it a genuine
  regression guard. Code-quality review passed ACCEPTABLE with one non-blocking
  Important item (same test, independently flagged) - fixed the same way; a
  Minor note on triplicated path-suffix-matching test helpers was left as-is
  per the reviewer's own "skip if it'd expand scope" caveat, matching this
  file's existing tolerance for that duplication. Tests: `apps/cli` 584/580 (4
  pre-existing skips), 0 failures; `packages/compiler` 328/327 (1 pre-existing
  skip), 0 failures (write-plan.ts itself untouched, reused as-is); clean
  `npm run check` (including `tsconfig.test.json`) on both workspaces. Not
  carried forward as open scope: `runModelPolicyWrite`/`--model-policy-strategy`
  write paths (I6a's already-reviewed scope) and `write-plan.ts` itself were
  both deliberately untouched.

I7 completed 2026-07-23 via one RED-first `/implement-next` cycle (plus a
spec-review fix round and a code-quality-review fix round). Added an
opt-in `doctor --models` category, entirely offline: a new pure classifier
(`packages/doctor/src/model-policy-doctor.ts`) reuses `compareModelPolicyUpgrade`/
`compareModelPolicyTabnineUpgrade` from `@agent-profile/compiler` (never
recomputing catalog/target support itself, per the brief's own
implementation-context note) to distinguish all ten required offline states
(current, supported-legacy, deprecated, retired, uncatalogued/private,
missing provenance, drifted configuration, advisory, unsupported,
unverified) as new `LINT-MODEL-001`..`009` codes. A separate `--probe` flag
reuses I4's `buildModelProbePlan`/`runModelProbe` unchanged via an
injectable `DoctorModelProbeRunner` port defined in `packages/doctor`
(keeping the correct dependency direction - `packages/doctor` never imports
`apps/cli`) with the real adapter wired in from `apps/cli/src/index.ts`
(`createDoctorModelProbeRunner`), following the same "explicit flag is the
consent, printed disclosure before any process starts" pattern I6c
established for `upgrade --probe-models`. Probe rows are additive
(`LINT-MODEL-PROBE-001`) and never alter another issue's severity from
ambiguous `unknown` evidence. Both flags are off by default; plain
`doctor` output stays byte-identical, proven via a CLI test running under
the existing `withNetworkSentinel` fixture. Spec review's first pass found
3 gaps, all fixed: (1) `LINT-MODEL-008`'s top-level "no configurable
model-policy surface" branch had no direct test (only its Tabnine-effort
sub-branch did) - fixed by exporting `classifyModelPolicyRow`/
`ComparableModelPolicyRow` (test-only, not re-exported from the package's
`index.ts`) so a fixture could reach it directly; (2) Tabnine's
legacy-lifecycle wording (`LINT-MODEL-001`) used the same generic message
as Codex/Claude, not explaining organization scope as the brief requires -
fixed by branching on `row.client === "tabnine"` for that specific message;
(3) the brief's "Documentation impact" section had no standalone doc page -
fixed by adding a `doctor --models` / `--probe` section with a full
`LINT-MODEL-*` code/severity table to `docs/cli/README.md`, following that
file's existing `LINT-HOOK-*` prose-block precedent (no separate
codes-reference file exists in this repo to follow instead). Code-quality
review passed with one non-blocking Important note - the new model-policy
block was inlined directly in `runDoctor` instead of following every
sibling check's `checkXxx`-helper extraction convention - fixed by
extracting `checkModelPolicyCategory` as a pure refactor (no behavior
change). Two Minor notes (a duplicated `row.client === "tabnine"` check,
and the test-only `classifyModelPolicyRow` export) were left as-is per the
reviewer's own judgment that both are reasonable, disclosed tradeoffs.
Tests: `packages/doctor` 104/104, `apps/cli` 587/587 (4 pre-existing
skips), both 0 failures; `npm run check` clean across all workspaces. Not
carried forward as open scope, per the brief's own non-goals: automatic
repair/remapping/provider login/update installation, and no warning merely
for Tabnine using an older organization-approved model (Tabnine's
legacy/deprecated rows stay informational only, never actionable).

I6d PR review fix round (2026-07-22, PR #129): a Codex bot automated review
found 6 findings against the cycle above, correctly disagreeing with its
"upgrade comparison table is a pure non-goal" framing - the approved brief's
own Behavior Slice step 3 requires Tabnine visibility in I6a's comparison
table, which the prior cycle had wrongly treated as fully out of scope.
Fixed: (1, P1) `renderSubagentPolicyTabnineGuideline` never received
`previousModelPolicy` and silently dropped the persisted `tabnine` override,
so `.tabnine/guidelines/87-subagent-task-capsules.md` could disagree with
`ai-profile.lock` about a resolved Tabnine model - fixed by extracting a
single-owner `deriveModelPolicyTabnineRoleOverrides` helper (replacing a
second hand-rolled, model-dropping projection) and threading
`previousModelPolicy` through `compiler.ts`'s `renderTarget` ->
`renderTabnineGuidelines`; (2, P2) an unchanged explicit Tabnine override
always stamped the current catalog version instead of reusing the prior
lock row's own recorded version - fixed via `findUnchangedExplicitTabnineOverride`
plus a shared `buildReusedTabnineResolution` helper; (3, P1) the upgrade
comparison table excluded Tabnine entirely - fixed by adding a separate
`compareModelPolicyTabnineUpgrade` (Tabnine's own honest row shape, no
invented effort/status-surface split) wired into `apps/cli`'s upgrade
text/JSON report at 3 of its call sites (the two preview paths and the
retain/no-op path); the scripted-write success/refusal JSON paths for
adopt/quality-first/cost-conscious remain unwired, a disclosed follow-up
(purely additive optional parameter, same shape as every other optional
report field, so the gap is an honest omission, not an inconsistency); (4,
P1) `planModelPolicyUpgrade` blindly relabeled prior Tabnine rows under a
new target preset, letting a stale row "launder" through one upgrade-write
round-trip and then get wrongly treated as validly locked on the next
ordinary compile - fixed by genuinely reconciling Tabnine rows for the
target preset via the same adapter functions ordinary compile uses; (5, P2)
`SubagentPolicyOverrideTarget` widened to include `"tabnine"`; (6, P1) the
Tabnine reuse-invalidation check fired for ANY role the profile's
`subagentPolicy.roles` map touched at all (even capability/effort-only or an
unrelated Codex/Claude override), wrongly wiping unrelated valid locked
Tabnine rows - fixed via a new `hasTabnineOverride`/`explicit` flag scoped to
the actual presence of `overrides.tabnine` in the raw profile. All 6 fixes
RED-first with regression tests. Tests: `packages/core` 217/218,
`packages/compiler` 324/325, `apps/cli` 576/580, all 0 failures (only
pre-existing skips); `npm run check` clean. All 6 PR review threads replied
to and resolved.

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

I6a PR review fix round 10 (2026-07-21, PR #125), after I6a was already
marked `done`: addressed 2 new Codex bot findings (P1) on the same
already-shipped `upgrade` write paths: (1) the file-changes preview
(`previewBulkPresetSwitchWrites`, added round 7/8) was still gated to only
the two bulk-preset-switch strategies via `targetPreset !== undefined`, so
`--model-policy-strategy adopt --write` on a v3-opted profile showed only
the model-policy comparison table - a summary, not an exact
on-disk-to-planned content diff - even though "adopt" can still regenerate
`.codex/config.toml`/`AGENTS.md`/`CLAUDE.md` - fixed by removing the gate
entirely (every strategy that can change target bytes now gets the same
exact preview) and renaming the function to `previewModelPolicyWrites`,
replacing its now-unused `targetPreset: ModelPolicyPreset` parameter with
`strategyLabel: string` used only for the printed header; (2)
`createOrApplyWritePlan`'s catch block discarded `AtomicWritePlanError`'s
`stage`/`unrestoredPaths` fields entirely, always printing the generic
"unsafe path" refusal even when `applyWritePlanAtomic` (round 8) reported
`stage: "rollback-incomplete"` - a genuinely more urgent situation where
specific files may still hold new, possibly incomplete, bytes rather than
their original content - fixed by special-casing that stage when
`unrestoredPaths` is non-empty, printing the exact affected paths and
reconciliation guidance (`git diff`/`git checkout`) instead of the generic
message, falling through to the existing generic message for every other
error shape. Two new `apps/cli/src/upgrade.test.ts` regression tests: one
exercises the "adopt" preview end-to-end (asserts the preview text appears
before the write's success confirmation, with real before/after content
lines); the other forces a genuine two-stage failure - a mid-commit rename
failure on `ai-profile.yaml` (the last target in the plan's alphabetical
commit order) after `.codex/config.toml` has already committed, then a
forced failure restoring that already-committed file - reaching a real
`rollback-incomplete` state (not mocked at the `AtomicWritePlanError`
boundary) via a shared default import of `node:fs/promises`, matching the
mutation style already established in
`packages/compiler/src/write-plan.test.ts`, restored in a `finally` block.
Getting this second test's mocked failures onto the correct files took one
iteration: `applyWritePlanAtomic` commits targets in alphabetical path
order (via `normalizeWrites`'s sort), not write-array order, so the first
attempt (fail-commit on the alphabetically-earlier `.codex/config.toml`)
never reached a prior successfully-committed file needing restoration -
corrected by swapping which file fails at which stage once the real commit
order was confirmed by instrumenting the write-plan directly. Spec review
passed COMPLIANT for both findings. Code-quality review passed ACCEPTABLE
with one non-blocking doc-comment polish (a stale `targetPreset` parameter
reference in `previewModelPolicyWrites`'s doc comment, left over from
before the round-10 signature change) - fixed. Tests: `apps/cli` 560/556,
all 0 failures, 4 pre-existing skips; `packages/compiler` 313/312, all 0
failures, 1 pre-existing skip; clean typecheck (including
`tsconfig.test.json`).

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

I8 first RED-first `/implement-next` cycle completed 2026-07-24, a disclosed
partial slice: fixed a genuine data-loss bug in the web profile editor rather
than yet starting on the brief's UI-rendering/documentation deliverables.
`apps/web/src/lib/profileEditor.ts`'s `buildCandidateProfile` already passed
`rawPermissions`/`rawSafety`/`rawCapabilities` through from a loaded profile
into the save candidate, but never passed through the v3 model-policy block
`subagentPolicy` (`AiProfileSubagentPolicy`) - so editing and saving any
profile via the web UI silently deleted its entire preset/per-role
exact-override/orchestration/evidence configuration, a direct violation of
AC1 ("preserves all legacy/v3 roles, presets, exact overrides ... and
unrelated profile fields"). First fixed (initial commit) by adding
`rawSubagentPolicy` to `ProfileCandidateSource` and a pass-through block in
`buildCandidateProfile` mirroring the existing `rawCapabilities` block,
plus threading `rawSubagentPolicy` through `ProfileViewModel`/`load()` in
`apps/web/src/routes/profile/+page.server.ts` (client-side round-trip
design). Spec review passed COMPLIANT and code-quality review passed
ACCEPTABLE on that initial cut.

A subsequent Codex-bot PR review round (PR #132) found the client-side
design itself had two real problems, both confirmed by reading the code
before fixing: (P1) `buildSubagentPolicyDoc`
(`packages/core/src/profile.ts`) never emitted `policy.preset` at all - a
pre-existing, previously entirely untested gap in the shared
`renderProfileYaml` renderer (used only by this web app; CLI writes use a
separate surgical byte-splice editor) that the client-side pass-through
newly made reachable, silently dropping a v3 profile's preset on every web
save; (P2) returning `rawSubagentPolicy` from `load()` embedded the raw
block - including freeform per-role override model strings - into the
browser's client-visible page data unredacted, unlike the YAML preview
which goes through `redactIfSecretLike`, even though no UI this cycle lets
a user view or edit that block at all.

Fixed by moving preservation entirely server-side instead: `preset` is now
emitted in `buildSubagentPolicyDoc` right after `enabled` (schema field
order); the client-side `rawSubagentPolicy`/pass-through plumbing added in
the initial cut was reverted as unnecessary (the block is never sent to
the browser at all now); `validateCandidate`
(`apps/web/src/lib/server/profileApiHelpers.ts`) gained an optional
`{ subagentPolicyOverride }` parameter that, when supplied, unconditionally
overrides the parsed candidate's `subagentPolicy` with the caller's value
(even forcing it to `undefined` when disk has none) - `/api/profile/plan`
calls it with the trusted on-disk value; `/api/profile/apply` deliberately
untouched (it only re-validates the plan's already-computed
`candidateYaml`, and the existing etag/staleness check guarantees that
value still matches disk). RED proof: new tests failed against the pre-fix
renderer (missing `preset:` in rendered YAML) and pre-fix `validateCandidate`
(no `options` parameter existed). GREEN proof: `packages/core` 219/219 (1
pre-existing skip), `apps/web` 196/196, both 0 failures, including a new
round-trip fixture (`SUBAGENT_POLICY_PROFILE`) and a route-level test
proving `/api/profile/plan`'s JSON response never contains the string
"subagentPolicy" while the preserved value (preset included) still lands
in the stored plan; root `npm run check` clean across all workspaces. Spec
review passed on this round too (one non-blocking Minor: this very ledger
entry needed updating to match, now done); code-quality review passed.
Deferred, disclosed, out of scope for this fix-round: `findSecretLikePaths`/
`findNulStringPaths` still don't scan subagentPolicy fields for secret-like
content or NUL bytes - acceptable today since the block is server-preserved-
only and not yet user-editable via any UI, but must be revisited once a
future I8 cycle ships an advanced-override UI that lets a user actually
type into it. Still fully open for later I8 cycles: role-aware preset/
advanced-override UI controls, per-target configured/advisory/unsupported/
unverified and Tabnine organization/private status rendering, retired-entry
picker handling, and the entire documentation-impact deliverable (root/
package README, schema, target, CLI, privacy, release docs). State stays
`ready`, not `done`.

I8 completed 2026-07-25 via two further `/implement-next` cycles (UI, then
documentation), closing every remaining acceptance criterion.

Cycle 2 (read-only model-policy UI, AC2 visibility/AC3/AC4/AC5): added
`apps/web/src/lib/server/modelPolicyView.ts`, a pure projection that builds
the profile page's model-policy table from the compiler's own resolvers
(`buildModelPolicyTargetTable`, `buildModelPolicyTabnineTargetTable`,
`deriveModelPolicyRoleOverrides`/`...TabnineRoleOverrides`) and contains zero
model identifiers, lifecycle values, or status literals of its own - the
brief's hard "do not embed a second model catalog in Svelte components or
prose tests" rule, which the tests also honor by asserting against resolver
output rather than hardcoded ids (even the retired fixture id is discovered
from `TABNINE_MODEL_POLICY_CATALOG`). Rendered in `+page.svelte` as a
read-only section: preset (with the standing recommendation), catalog
version, the primary role hoisted out, and the full per-role table behind a
`<details>` expander. Spec review found two real blockers, both fixed rather
than disclosed: (1) AC3's required Tabnine `organization/private - unrated`
label was missing (the UI rendered a bare `unrated`) - fixed by extracting
`tabnineLifecycleLabel` in `packages/compiler/src/subagent-policy-guidance.ts`
as the single owner of that wording, consumed by both `renderTabnineModelCell`
and the web view so the page and the generated guidance tables cannot drift;
(2) AC4's "profile/lock" half was unimplemented - the view resolved fresh and
ignored a prior lock's retained rows, so the UI could disagree with the
generated files - fixed by adding `readLockModelPolicy` (deliberately NOT
called from `loadProjectContext`, which runs on every navigation including
the write endpoints, so eleven other consumers don't pay for a field only
this route reads) and threading `previousModelPolicy` into both table
builders. Code-quality review then flagged two untested claims that were
both backing already-shipped documentation - the secret-like redaction of
resolved identifiers, and the lockfile read/validate/project chain itself
(the AC4 test hand-built its lock object and bypassed the file read) - both
closed with real regression tests, plus an invalid-lockfile-degrades test.
Also applied from review: expose `recommendedPreset` unconditionally so a
project on a non-default preset is still told what is recommended, suppress
the lifecycle badge when no model resolved, redact `alternatives`/
`guidedCandidates`, and type `statusTone`/`lifecycleTone` to the core unions

- which immediately caught a latent out-of-union `"unknown"` fallback in
  `headlineStatus`. RED proof: with `modelPolicyView.ts` moved aside the new
  suite failed 0-pass/1-fail; the lock-replay and org/private tests failed
  against the pre-fix code for their own reasons. GREEN: 20 model-policy
  tests, `apps/web` 216/216, `packages/compiler` 331 pass/0 fail (no golden
  churn from the label extraction), root `npm run check` clean.

Cycle 3 (AC6 documentation): rewrote root `README.md`'s "Recommended Model
Settings" from generic prose predating the phase into the implemented
lifecycle (preset table with `role-aware` as recommended default, the
before-write exact-name guarantee, the four capability statuses and what
each actually means, and honest per-tool reality - Codex writes only the
primary role's row into `.codex/config.toml`, Claude is guidance-only,
Tabnine is guided manual selection with an ownership-gated `model.id` write
and permanently `unsupported` effort); mirrored it into the published
`packages/agent-profile/README.md`; documented the previously-undocumented
`upgrade --model-policy-strategy`, `--check-for-updates` (incl. its `--json`
rejection) and `--probe-models` in `docs/cli/README.md`, closing the gap
I6a/I6b had disclosed; accuracy pass on `docs/targets/subagent-policy.md`.
`docs/security/trust-model.md`'s "Network Behavior" section was found
actively contradicting the implementation - it still claimed commands "must
run without network access" full stop, predating the two shipped opt-in
paths - and was rewritten with a table of exactly what each path sends and
persists, the probe's source-free isolation guarantees, and the UI's
never-probes/no-account-data boundary; its "Local UI Server" section gained
the lockfile read-only/degradation rule and the server-side `subagentPolicy`
preservation + redaction rules.

Carried forward as open scope, deliberately not claimed by I8: advanced
per-role/exact-override _editing_ UI in the browser (the brief's AC2 wording
"progressively exposed" is satisfied for visibility; editing remains
CLI-only by design, and the page says so). Also still open from the earlier
fix-round: `findSecretLikePaths`/`findNulStringPaths` do not scan
subagentPolicy fields - the block stays server-preserved-only and
non-user-editable through the browser, so no new user-controlled input
surface exists today, but this must be revisited if an editing UI ever
ships. Display helpers in `+page.svelte` (`statusTone`/`lifecycleTone`/
`modelLabel`/`headlineStatus`) remain in the component rather than extracted
to a testable `$lib` module per this page's own `profileEditor.ts`
precedent - a disclosed code-quality follow-up, not a behavior gap.

I9 first RED-first `/implement-next` cycle completed 2026-07-24, a disclosed
partial slice: added `scripts/release/phase31_5-published-journey.test.mjs`
(picked up automatically by root `test:release`'s `scripts/release/*.test.mjs`
glob), mirroring the already-shipped Phase 31 I8 precedent
(`scripts/release/phase31-published-journey.test.mjs`)'s helper shape
(`runNpm`, `buildPackedWorkspaces`, `npmPack`, `extractPackage`,
`linkRuntimeDependency`, `snapshot`, `withRuntimeSentinels`) and building/
packing the same six workspaces (`@agent-profile/web` excluded, as before).
Proceeded despite I9's own `Dependencies: I1-I8` line technically being
unsatisfied (I8 is still `ready`, not `done`) because I8's only remaining
open scope is the web app's advanced-override UI and documentation, which
none of I9's own acceptance criteria touch - disclosed, not silently
resolved. This cycle closes three of I9's acceptance-criteria bullets, for
the packed CLI `init` scenario only: (1) packed `@agent-profile/core`/
`compiler`/`doctor` tarballs are proven (against the real
`fixtures/npm-pack/agent-profile-*.json` file-list fixtures) to include their
model-policy dist runtime assets and to contain no test-only model-probe/
catalog fixture path; (2) the packed CLI's non-interactive-scripted `init`
wizard is proven to render the exact role-aware default per-role model/
effort/status summary in stdout before any write commits, with expected
values computed from the actually-built `packages/compiler/dist/index.js`'s
`buildModelPolicyTargetTable("role-aware")` output rather than hand-guessed
strings; (3) that entire scenario runs inside a `withRuntimeSentinels`
deny-all wrapper (fetch/child_process/net), proving zero external calls.
One environment-only addition beyond the Phase 31 precedent: a `toTarPath`
helper converts absolute Windows paths to POSIX-style (`/c/...`) form before
invoking `tar`, working around a Git-for-Windows/MSYS `tar` quirk (confirmed,
not assumed, to also affect the untouched Phase 31 precedent file on the same
machine) that misparses `C:\...` paths as remote-host specs; scoped only to
the new file, deliberately not backported to the precedent file. RED proof:
the file did not exist before this cycle. GREEN proof: the new file's own
`node --test` run passes 1/1; `npm run check` and `npm run verify:pack` both
pass. The full `npm test` (every workspace plus all `scripts/release/*.test.mjs`)
was not run this cycle, a disclosed time-budget tradeoff substituted with
`npm run check` + `npm run verify:pack` + the new file's own direct run.
Spec review passed COMPLIANT (verified the package-contents assertions
against the real pack fixtures, traced the full `init` call chain to confirm
the asserted stdout shape matches already-shipped, already-tested wizard
output verbatim, and confirmed the network sentinel wraps the exact call
under test). Code-quality review passed ACCEPTABLE with three non-blocking
Minor notes (left as-is): inconsistent-but-currently-safe `escapeRegExp`
usage across closed-enum vs. free-form interpolations, a doc comment on
`toTarPath` that overclaims cross-platform-Windows-tar safety when only
Git-for-Windows/MSYS tar was actually verified (CI is Ubuntu-only), and an
unused `confirmModelProbe` prompt-call tracking field. Still left open for
later I9 cycles: probe consent/decline and one normalized probe path,
Tabnine organization/private manual path and the ownership-aware
settings-file write path (absent/generated-owned reaching a real write;
unowned staying preserved/advisory), normal compile lock reuse, upgrade
retain/adopt, offline Doctor, the full published-asset inventory beyond
model-policy assets, the final spec-to-test matrix document, and release-
notes/documentation-impact deliverables. State stays `ready`, not `done`.

I9 cycle 1 PR review fix rounds (2026-07-24, PR #133): a Codex bot automated
review found and confirmed 12 real findings across three rounds against
`scripts/release/phase31_5-published-journey.test.mjs`, all fixed with
RED-first regression evidence (typically a scratch script proving the old
code missed a synthetic violation the new code catches), all replied to and
resolved as GitHub review threads. Round 1 (4 findings): (1) the role-aware
table assertion checked only the primary role's stdout summary, missing a
corrupted/omitted non-primary role - fixed by `assert.deepEqual`-ing the
_entire_ per-role table passed to `selectModelPreset` against the packed
compiler's own `buildModelPolicyTargetTable` output (disclosed as a partial
fix: exercising `createClackPrompts`'s own on-screen rendering of that table
remains out of reach without a product-code change, since it is not part of
the packed CLI's public surface today); (2) `withRuntimeSentinels`'s `deny()`
only threw, so a forbidden call caught-and-normalized internally (e.g. a
future probe/update-check path) would pass silently - fixed by recording
denied surfaces and asserting none were reached after `action()` completes;
(3) the packed CLI's dynamic import happened outside the sentinel-guarded
closure - moved inside; (4) the declined-write assertion relied only on a
before/after directory snapshot, which a write-then-restore sequence would
not catch - fixed with a new opt-in `withFsWriteSentinel` instrumenting
`node:fs/promises`'s mutating surface. Round 2 (4 more findings, all
confirmed via investigation before fixing): (1) the `--force-local`/
`toTarPath` tar workaround was GNU-tar-specific and would break on macOS/
native Windows bsdtar - fixed with a cached `tarIsGnu()` runtime detection
that only applies the workaround for GNU tar; (2) the four runtime
dependencies (`ajv`/`yaml`/`jsonc-parser`/`@clack/prompts`) linked into the
isolated `node_modules` graph were hard-coded rather than derived from the
packed CLI's own manifest - fixed with `computeRuntimeDependencyGraph`, a
BFS over each packed workspace's own published `package.json` starting from
the packed CLI (added `@agent-profile/scanner` to the built/packed
workspaces, since the CLI's manifest depends on it); (3) the role-aware
table oracle imported from the raw workspace `packages/compiler/dist/
index.js` rather than the packed compiler tarball, so a broken published
entry point would go undetected - fixed by importing from the
extracted, packed `@agent-profile/compiler` tarball instead; (4) the
test-only-fixture-path scan covered only the three model-policy-owning
workspaces, missing e.g. a fixture accidentally published by
`@agent-profile/cli` itself - fixed by scanning every packed workspace.
Round 3 (3 P2 findings plus one P1): (1) `computeRuntimeDependencyGraph`
derived the dependency graph but discarded every declared version/range,
so a stale or incompatible pin would still silently extract/link whatever
was present - fixed by asserting internal `@agent-profile/*` edges'
declared versions exactly match the dependency's own packed version, and
external dependencies' declared ranges are satisfied by the linked root
`node_modules` package, via a new deliberately minimal
`satisfiesDeclaredVersionRange` comparator (exact versions and
`^major.minor.patch` only, matching this repo's actual manifests - no
`semver` dependency added, none is resolvable from this repo); (2)
`withFsWriteSentinel` patched only module-level `fs.promises.*` functions,
completely missing the real production write path
(`packages/compiler/src/write-plan.ts`'s `writeTempBeside`, which mutates
bytes and permissions through a `FileHandle`'s own instance methods after
`fsPromises.open`) - fixed by wrapping `fs.promises.open` so the returned
handle is a `Proxy` intercepting its mutating instance methods
(`write`/`writev`/`writeFile`/`chmod`/`truncate`/`appendFile`/`datasync`),
plus adding `chmod`/`chown` to the module-level list; (3) the preview
assertions only checked the final accumulated stdout, not that the preview
rendered _before_ `confirmWritePlan` fired - fixed by snapshotting stdout
inside that prompt callback and asserting the preview lines are already
present in that snapshot, in addition to the final-stdout check. The P1
finding asked for the full validation suite to actually be run before
treating this cycle as reviewed and compliant (a prior round had
substituted `npm run check`/`verify:pack` for time-budget reasons) - `npm
test` was run in full: 1537 tests, 1523 pass, 1 fail, 13 skipped; the one
failure is the untouched sibling `scripts/release/phase31-published-
journey.test.mjs` hitting the identical MSYS/Git-for-Windows tar
drive-letter bug already fixed in this cycle's own file but deliberately
not backported to the sibling (a pre-existing, disclosed, environment-
specific issue unrelated to this change); `npm run doctor` exits 1 on
pre-existing `.claude/settings.json`/`.claude/settings.local.json`/
`.mcp.json` drift unrelated to this file; no separate golden-test command
exists (golden fixtures are ordinary `node:test` cases already inside
`npm run test --workspace @agent-profile/compiler`, itself part of `npm
test`). Round 4 (2 more P2 findings): (1) `satisfiesDeclaredVersionRange`'s
caret-range branch treated any `^major.minor.patch` as "same major, and
minor.patch >= declared" regardless of major version, which is wrong for a
zero-major package under real npm/node-semver caret semantics (`^0.2.0`
must reject `0.3.0`, not accept it, since pre-1.0 minor bumps are breaking)

- fixed by branching on the declared major: nonzero-major keeps the
  original behavior, `^0.y.z` (y>0) locks major.minor and only allows patch
  to float upward, and `^0.0.z` locks to that exact version. No current
  manifest uses a zero-major external dependency, so this changed no
  existing pass/fail outcome, but closed a real gap; (2) the sentence above
  this Round 4 addendum ("proven against the real
  `fixtures/npm-pack/agent-profile-*.json` file-list fixtures") was accurate
  only as a one-time manual cross-check performed during cycle 1's
  implementation - the test itself never actually read those fixture files
  at runtime, so a future drift between the golden fixture and the
  hard-coded required-asset list would have gone unnoticed. Fixed for real
  (not just reworded): a new `readNpmPackFixture` helper now reads each
  fixture from disk at test time and asserts every required asset path is
  still listed there, in addition to the existing check against the freshly
  packed tarball - genuine three-way runtime coupling (hard-coded list <->
  golden fixture <-> fresh pack output) rather than static-only evidence.
  Round 5 (1 more P2 finding): `computeRuntimeDependencyGraph` unconditionally
  skips `@agent-profile/web` when walking the CLI's declared dependencies, so
  a stale/missing/unusable packed `web` release could not be caught the way
  every other internal dependency edge now is. Judged as a disclosed partial
  mitigation rather than a full fix: `apps/cli/bundle.mjs`'s own comment
  documents `@agent-profile/web` as a lazy, `require.resolve`-only dependency
  needed solely for the `ui` subcommand, which this journey's only scenario
  (`init`) never touches; the already-shipped, already-`done` sibling
  `scripts/release/phase31-published-journey.test.mjs` has this exact same
  exclusion and was never flagged for it; and fully building/packing a
  SvelteKit app purely to validate an unexercised dependency edge would be a
  disproportionate scope expansion for a review-fix round. Added a cheap,
  real check instead: a new `assertWebDependencyVersionMatches` compares
  `apps/cli/package.json`'s declared `@agent-profile/web` version against
  `apps/web/package.json`'s own version directly from the source tree (no
  build/pack required), catching the common stale-version-bump failure mode,
  with a code comment documenting the tradeoff and naming a future
  `ui`-subcommand cycle as the natural point to add real packed validation.
  Round 6 (4 more P2 findings, all in the same file): (1) the packed-compiler
  import (the role-aware table oracle) ran before `withRuntimeSentinels`
  installed its guards, so a side effect in a compiler-only module the CLI
  bundle tree-shakes away could execute unrecorded - moved into its own
  guarded closure, kept separate from the later `init`-scenario guard since
  they are two conceptually distinct actions; (2) `withFsWriteSentinel`
  patched `fs.promises` properties but never called
  `syncBuiltinESMExports()`, so a write reached through a named ESM import
  (e.g. `import { open } from "node:fs/promises"`, the pattern shipped
  modules like `personal-activation.ts`/`model-probe.ts` actually use) could
  bypass the patched bindings entirely and evade detection - fixed by adding
  the sync call after patching and again after restoring, mirroring
  `withRuntimeSentinels`'s existing pattern exactly; (3)
  `testOnlyFixturePathPattern` missed common test-only naming conventions
  (a plain `fixtures/` directory segment without a leading double
  underscore, a `.fixture.` infix, `.spec.` suffixes, and `.mjs` test files)
- broadened accordingly, re-verified against the repo's real packed file
  lists for false positives; (4) `buildPackedWorkspaces` never cleaned prior
  build output before rebuilding, so `tsc -b`'s incremental build could leave
  a stale orphaned `dist/` asset (from a since-removed/renamed source file)
  in the packed tarball even though a genuine clean-checkout build would
  never produce it - fixed by removing each workspace's `dist/` before
  rebuilding, with one important correction found during verification and
  documented in the code comment: deleting `dist/` alone is insufficient,
  since `tsc -b` consults `tsconfig.tsbuildinfo` (which lives next to
  `tsconfig.json`, not inside `dist/`) to decide whether a rebuild is needed
  at all, so removing only `dist/` left it seeing unchanged source hashes and
  skipping emission entirely (worse than the original stale-file problem);
  the fix also removes each workspace's `tsconfig.tsbuildinfo`. All six
  rounds' fixes (19 findings total) were scoped to the one owned file; no
  product code, `TASKS.md` (until this entry), or the sibling precedent file
  were touched. State stays `ready`, not `done` - same open scope as the
  cycle-1 entry above.

I9 second RED-first `/implement-next` cycle completed 2026-07-26, another
disclosed partial slice in the same owned file
(`scripts/release/phase31_5-published-journey.test.mjs`, no product code
touched). Closes exactly one more acceptance-criteria fragment - "probe
decline and one normalized probe path" - as two `await t.test(...)` subtests
inside the existing top-level test body, deliberately reusing the one
expensive `buildPackedWorkspaces()` + seven `npm pack` runs rather than
paying them again in a second top-level `test()`; cycle 1's assertions are
untouched. Scenario A (decline): scripted headless prompts with
`confirmModelProbe -> false` plus an injected fake `probeRunner` prove the
injected runner is invoked zero times (recorded invocations, not just a
count - `runModelProbe`'s consent gate returns before touching the runner
seam), that `confirmModelProbe` was genuinely reached with `default: false`
and disclosed a call bound at least as large as the planned selections (so
"zero invocations" cannot pass by skipping the step), that the exact declined
summary line rendered in a stdout snapshot captured _inside_
`confirmWritePlan` (proving preview-before-confirmation, not merely
present-somewhere), and that nothing was written (strict `withFsWriteSentinel`
plus `snapshot()` equality). Scenario B (one normalized consented path, fake
runner returning `{exitCode:0, stdout:"OK"}` which the real classifier maps to
`available`): exactly one process per planned selection - correct by contract,
not coincidence, since `available` breaks out of the candidate loop before any
ordered alternative runs - and within the `maxCalls` bound disclosed to the
user; per invocation, the pinned source-free/non-persistent contract from
`docs/research/013-model-probe-invocation-evidence.md` is asserted against the
invocation object the fake runner actually receives: correct executable,
`--model <exact model resolved by the packed compiler>`, the fixed
content-free prompt verbatim exactly once, Codex's isolation/non-persistence
argv (`exec --sandbox read-only`, `--skip-git-repo-check`, `--ephemeral`,
`--ignore-user-config`, `--ignore-rules`) with adjacency enforced, a
`-c model_reasoning_effort=` argument, no repository/checkout path anywhere in
argv, a fresh empty cwd outside both the fixture repo and this checkout,
an environment restricted to `MODEL_PROBE_ENV_ALLOWLIST` with every forwarded
value equal to the real ambient value and a deliberately injected
non-allowlisted ambient sentinel key proven dropped. `withFsWriteSentinel`
gained an optional `allowMutation(method, target)` predicate (omitting it
preserves cycle 1's strict behavior byte-for-byte, and scenario A uses the
strict form); scenario B needs it because `runModelProbe` legitimately `rm`s
its own temporary probe directory, and the predicate is narrowed to
`os.tmpdir()` paths prefixed `agent-profile-probe-` only, with the resulting
`rm` calls asserted 1:1 against the invocation cwds rather than merely
collected - so the allowance is proven necessary instead of leaving an
unexercised hole. Both scenarios run the packed `import()` and `runCli` inside
`withRuntimeSentinels`. Spec review returned ISSUES_FOUND with one genuine
HIGH defect the implementer's own bare `node --test` run could not see: the
"no repository path in any forwarded env value" assertion also applied to
`PATH`, which the product intentionally allowlists and forwards verbatim, and
`npm run` prepends `<repo root>/node_modules/.bin` to it - so the assertion
failed under the repo's own `npm run test:release`/CI invocation. Fixed by
exempting `PATH`/`PATHEXT` from the leak check only (the value-equals-ambient
and allowlist-subset assertions still guard those keys), and the RED was
re-captured through `npm run test:release` to prove it. Spec review's two
other findings were fixed the same round (the `allowMutation` predicate had
been wider than its own disclosure, permitting any mutation outside the repo
including HOME/config and the extracted `node_modules` graph; and the subtest
named "non-persistent invocation" asserted none of the pinned isolation
flags). Code-quality review returned ISSUES_FOUND with no blockers; landed
this cycle: four `assert.ok(..., rawStdout)` calls whose messages replaced the
diff with a wall of stdout without naming the expected line, the write-only
`probeTempMutations` list described above, the effort-forwarding check, two
overclaiming comments (the header and in-loop comments implied both clients'
isolation rows were exercised, but `probeClients = ["codex"]`, so the Claude
row is a dormant pinned expectation - now stated as such), and prettier
formatting (this file is covered by the root `prettier --write .` but not by
`npm run check`, since `scripts/` is outside every workspace). Verified:
`npm run test:release` passes all three tests in this file (64 tests, 63 pass,
1 fail - the untouched sibling `scripts/release/phase31-published-journey.test.mjs`
hitting the same pre-existing MSYS/Git-for-Windows `tar` drive-letter bug
already documented in cycle 1, unrelated to this change); `npm run check`
clean. Disclosed, accepted tradeoffs: four hard-coded oracle copies (fixed
prompt, env allowlist, isolation argv, temp-dir prefix) because
`apps/cli/src/model-probe.ts` is re-exported by no packed artifact (the packed
CLI's only real exports are `runCli` and `CLI_VERSION`) - re-verified, not
assumed, each with an in-file source-of-truth pointer and a failure message
naming the file to sync; the allowlist coupling is subset-only, so a _shrunk_
allowlist still passes; probe bounds are checked structurally only (the pinned
maxima are unexported and already unit-tested in
`apps/cli/src/model-probe.test.ts`); the effort _value_ mapping is not
re-derived; the cwd-inside-`os.tmpdir()` assertion is near-tautological and
labelled as such; Claude's isolation row activates only when a later scenario
selects `claude`. Code-quality follow-up deferred by explicit agreement, to be
done BEFORE the next scenario is added to this file rather than after:
extract the ~200-line per-invocation assertion loop into named helpers,
extract a shared `runPackedProbeInit` harness (the two scenarios currently
copy the whole run scaffolding), and de-index-couple the
`expectedProbeSelections[index]` pairing (harmless with one client, will
silently mispair once a scenario selects both). Still left open for later I9
cycles: Tabnine organization/private manual path and the ownership-aware
settings-file write path, normal compile lock reuse, upgrade retain/adopt,
offline Doctor, the full published-asset inventory beyond model-policy
assets, the final spec-to-test matrix document, and release-notes/
documentation-impact deliverables. State stays `ready`, not `done`.

I9 third `/implement-next` cycle completed 2026-07-26, in the same owned file
(no product code). Two parts. Part A paid the refactor debt cycle 2's
code-quality review deferred on the explicit condition that it land BEFORE any
new scenario was added: extracted `assertProbeInvocationIsSourceFree` and
`assertProbeEnvironmentIsAllowlisted` from the ~200-line inline per-invocation
loop, extracted `runPackedInitScenario` as the shared run harness both probe
subtests now use (its `filesystemMutations` option has no default and must be
either the literal `"strict"` - which passes no options object to
`withFsWriteSentinel`, i.e. cycle-1 behavior byte-for-byte - or
`{ allowMutation }`, so a scenario can no longer silently inherit the weaker
claim), and replaced the index-coupled `expectedProbeSelections[index]` pairing
with an `expectedByClient` lookup plus a sorted-multiset assertion and a loud
failure for an unplanned client. Behavior preservation was checked by running
the suite before and after (identical results), and spec review independently
mapped every cycle-2 assertion to its new location. One coverage item was
deliberately dropped and disclosed: execution ORDER of independent selections
is no longer asserted (nothing in the probe contract makes it observable, and
with one client the sorted compare is exact equality). Part B closed one more
acceptance-criteria fragment - "Tabnine organization/private manual path",
advisory path only - as three new subtests reusing the same single build/pack:
the guided-manual advisory line for a Tabnine selection with no override; an
uncatalogued private/organization id proven ACCEPTED (never rejected, per
Tabnine's documented no-auto-selection contract - `validateModelPolicyOverride`
rejects only empty/oversized/control-character ids, with no catalog check) and
labelled `[unverified, uncatalogued]`; and a catalogued id labelled
`[catalogued]`, so the two labels are distinguished differentially by real
behavior rather than one asserted in isolation. The catalogued id is READ at
runtime from the packed compiler tarball's own `TABNINE_MODEL_POLICY_CATALOG`
(verified reachable: `packages/compiler/src/index.ts` re-exports it, so no
hard-coded catalog copy was needed) and the private id is a fixed literal
asserted ABSENT from that same packed catalog, so a catalog change can never
leave these scenarios asserting the wrong label. Notable: the CLI bundle
inlines its own copy of the catalog while the oracle comes from the separately
packed compiler, so a divergence between the two published artifacts would
surface here. All three run under `withRuntimeSentinels` with the packed
`import()` inside the guard, use strict `withFsWriteSentinel` (Tabnine is never
probed, so no temp-dir allowance is needed), decline the write plan, and assert
the preview line against the stdout snapshot captured inside `confirmWritePlan`
before re-checking final stdout. Spec review returned ISSUES_FOUND with no
blockers and no real defects, confirming byte-exactness of both rendered
`formatModelPolicySummary` branches, that the `respondToAdvancedOverrides`
function-or-absent switch encodes two genuinely different wizard code paths
(omitting `selectAdvancedOverrides` skips the step entirely; supplying one that
returns `undefined` runs it and declines), and that nothing out of scope was
started. Code-quality review returned ISSUES_FOUND with two Important items,
both fixed this cycle: (1) the extraction banner claimed "nothing was weakened,
dropped, or merged" while the moved `assert.equal(invocation.command,
expected.client)` had become unfalsifiable under the new by-client lookup - the
tautological assertion was deleted, its WHY comment moved to the multiset
assertion that genuinely proves it, and the banner reworded to enumerate its
exceptions honestly (the same overclaiming-comment class cycles 1 and 2 both
rejected); (2) the Slice 5 banner claimed a Tabnine-only selection "skips the
probe step entirely" while the only evidence was zero runner invocations, which
a step that ran and was declined would produce identically - now asserted
directly via the absence of any `confirmModelProbe` call. Five Minor items were
folded in: dropped two redundant/never-emitted stdout assertions in the
private-override scenario (both wizard rejection paths write to stderr, so
`stderr === ""` plus the exact line is the whole proof), added an
`expectedByClient.size` guard against silently collapsed duplicate-client
selections, corrected the "both ids derived from the catalog" overclaim,
renamed the harness option to `allowMutation` so the name no longer changes
across the call boundary, and added a named `DECLINE_ADVANCED_OVERRIDES`
constant so the absent-vs-declined contrast is visible at the call site.
Tests: all six tests in the file pass (`npm run test:release`: 67 tests, 66
pass, 1 fail - the untouched sibling
`scripts/release/phase31-published-journey.test.mjs` hitting the same
pre-existing MSYS/Git-for-Windows `tar` drive-letter bug documented in cycle
1); `npm run check` clean; prettier clean. Disclosed, accepted: the two
rendered Tabnine strings are hard-coded byte-exact copies, since
`formatModelPolicySummary` is module-private in `apps/cli` and unexported from
every packed artifact (re-verified); the catalogued-branch scenario has no
independent RED of its own (its label is behavior-derived via the private
scenario's own RED, which asserted `[catalogued]` against the private id and
failed showing `[unverified, uncatalogued]`); and all three scenarios select
`["tabnine"]` alone, so mixed Tabnine+Codex/Claude summaries stay uncovered.
Code-quality follow-up scheduled BEFORE the Tabnine settings-file write
scenario lands (both reviewers agree that scenario is what these will collide
with): generalize `runPackedInitScenario` with `args`/`confirmWrite` (renaming
to `runPackedCliScenario`, since the remaining scenarios are not all `init` and
the write path needs a committed write); migrate the still-hand-rolled
role-aware scenario onto the shared harness (needs `tables` recorded
unconditionally in the prompts factory); extract the now-triplicated "rendered
before confirmation / survived to final stdout / nothing written" assertion
block; give `environmentOverrides` save-and-restore semantics instead of
unconditional delete, and document the sequential-subtest invariant the two
process-global sentinels depend on; rename the two assertion helpers (the
"source-free" one also asserts isolation argv, cwd, and bounds) and collapse
their duplicated `forbiddenPathFragments`/`repository` parameters; rename the
probe-flavoured shared helpers and banners now that Tabnine scenarios use them;
and add a fixture-directory collision guard. Still left open for later I9
cycles: Tabnine's ownership-aware settings-file write path (absent and
generated-owned reaching a real write; unowned staying preserved/advisory),
normal compile lock reuse, upgrade retain/adopt, offline Doctor, the full
published-asset inventory beyond model-policy assets, the final spec-to-test
matrix document, and release-notes/documentation-impact deliverables. State
stays `ready`, not `done`.

I9 completed 2026-07-26. The packed-only journey now builds, packs, extracts,
and installs the complete CLI dependency graph (including `@agent-profile/web`)
in an isolated fixture; proves the role-aware, probe, Tabnine manual and
ownership-aware write, lock-reuse, retain/adopt, and offline-Doctor outcomes;
and checks the published help, schema, runtime assets, fixture exclusion, and
Phase 31.5 documentation links. The final matrix and release notes record the
remaining static-only documentation evidence. A packed-journey RED exposed a
Doctor false positive (`LINT-LOCK-005`) for a generated-owned Tabnine file;
Doctor now preserves its baseline compiler-error short circuit before loading
the lock and recompiles with retained model policy only after baseline success.
Focused Doctor and packed tests protect valid retained ownership, changed or
removed overrides, invalid-compile lock suppression, and exact probe-temp
cleanup. Final review result: spec compliant and code quality acceptable.
Validated: `npm test --workspace @agent-profile/doctor` (109/109),
`node --test scripts/release/phase31_5-published-journey.test.mjs` (11/11),
the complete `npm test` workspace and release suite, `npm run check`,
`npm run verify:pack`, Prettier, and `git diff --check`. Root `npm run doctor`
reports only pre-existing user-owned `.claude/settings.local.json` and
`.mcp.json` drift, which remains outside I9 scope. Phase 32 I1 may now proceed
according to its own ledger prerequisites.

I9 PR review closure 2026-07-27: Doctor's expected generated-owned Tabnine
metadata is now an independent product oracle, so a corrupt lock cannot teach
the validator its own wrong target or template id. The packed journey
instruments `mkdtemp` before allowing probe-directory cleanup, watches
credential and client-config roots as well as the repository, proves offline
Doctor never calls the injected probe runner, and exercises mapping-v2 retain
and adoption as real byte-preserving/mutating transitions. The final matrix
enumerates the Phase 31.5 validation codes, closed probe statuses, CLI exit,
Doctor finding codes, redaction evidence, and static-only provider boundary.
The full `npm test` gate completed successfully, replacing the earlier timed
out attempt.

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

| Id  | Task                                                     | State      | Brief                                                                                                          |
| --- | -------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | Grill session: upgrade "custom exact" strategy design    | human-gate | [001-upgrade-custom-exact-strategy.md](docs/specs/phase-31.9/001-upgrade-custom-exact-strategy.md)             |
| 2   | Maintainer decision: catalog lifecycle history retention | human-gate | [002-catalog-lifecycle-history-retention.md](docs/specs/phase-31.9/002-catalog-lifecycle-history-retention.md) |

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

## phase-33: Change-Risk Review Assurance (`docs/specs/phase-33/001-change-risk-review-assurance.md`)

Approved 2026-07-24 from the change-risk review grill agreement. Adds an
independent full-change reviewer after spec and code-quality review, bounded
remediation and escalation, versioned review-learning records, recurring-
finding promotion, and a provider-neutral external-review boundary.

| Id  | Task                                            | State      | Brief                                                                                                    |
| --- | ----------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| I1  | Emit the independent change-risk reviewer       | done       | [001-change-risk-reviewer.md](docs/specs/phase-33/issues/001-change-risk-reviewer.md)                    |
| I2  | Orchestrate bounded review remediation          | done       | [002-bounded-review-remediation.md](docs/specs/phase-33/issues/002-bounded-review-remediation.md)        |
| I3  | Persist versioned review-learning records       | done       | [003-review-learning-records.md](docs/specs/phase-33/issues/003-review-learning-records.md)              |
| I4  | Promote recurring findings into stronger guards | ready      | [004-recurring-finding-promotion.md](docs/specs/phase-33/issues/004-recurring-finding-promotion.md)      |
| I5  | Backfill the recent PR review corpus            | human-gate | [005-historical-review-backfill.md](docs/specs/phase-33/issues/005-historical-review-backfill.md)        |
| I6  | Validate the published review workflow          | sequenced  | [006-published-workflow-validation.md](docs/specs/phase-33/issues/006-published-workflow-validation.md)  |
| G2  | Grill session: approve amendment 002            | done       | [002-root-cause-clustering-amendment.md](docs/specs/phase-33/002-root-cause-clustering-amendment.md)     |
| I7  | Cluster vocabularies and cluster-key derivation | done       | [007-cluster-key-derivation.md](docs/specs/phase-33/issues/007-cluster-key-derivation.md)                |
| G3  | Grill session: approve amendment 003            | done       | [003-cluster-history-handoff-amendment.md](docs/specs/phase-33/003-cluster-history-handoff-amendment.md) |
| I8  | Budget exhaustion degrades to NEEDS_CONTEXT     | ready      | [008-reviewer-budget-exhaustion.md](docs/specs/phase-33/issues/008-reviewer-budget-exhaustion.md)        |

Dependency map: I1 -> I2; I1 -> I3; I1+I3 -> I4; I3 -> I5;
I1+I2+I3+I4+I5 -> I6. I3 is sequenced after I1 because it consumes the
shared policy source's closed values and learning-record projection. I5 is
parallel-safe with I2 and I4 after I3 lands. I6 is final integration and
requires I5's accepted backfill evidence.

G2 completed 2026-07-28: amendment 002 (root-cause clustering) approved from
its grill and synthesized. Motivated by PR #139's own review history - three
rounds, 25 findings, six across rounds 2 and 3 sharing one root cause - where
the approved contracts would have bounded the loop (fix-round cap,
blocker-count stagnation) but not diagnosed it: fingerprints identify the same
finding across rounds, nothing groups distinct findings sharing a cause, and
the within-change occurrence dedup means repeated same-class misses inside one
change can never reach a promotion threshold.

The grill rejected three of the draft's four substantive points, so the file
was rewritten rather than patched. (1) The draft keyed clusters on
`category + affected contract + unsafe-condition class`; applied to the actual
corpus that splits the motivating cluster, because `change-risk-categories/v1`
classifies product risk while the shared cause was a defect mechanism - a
missing process-execution glob reads as `network-process-boundary`, a missing
generated-ownership glob as `ownership-atomicity`. Cluster key is now
mechanism-keyed (`affectedContractId + unsafeConditionClass`), category
excluded (ADR 0026). (2) Both components are closed reviewer-supplied
vocabularies with an `other` fallback, mirroring the proven
`change-risk-categories/v1` shape; the rejected alternative (free text plus an
owner-side alias table) would have shipped inert, since a v1 alias table
starts empty and clusters would form only on byte-identical reviewer prose.
This also resolves F4 by giving `ChangeRiskContractId` a sanctioned job,
widened beyond its seven high-risk surfaces. (3) The draft gated the
escalation trigger on a cluster having formed, which traced against the corpus
misses its own motivating case: round 2 had only two same-key members, below
the threshold, so no cluster formed and round 3's four-member cluster would
not have counted as a recurrence. Batching (>= 3) and the recurrence trigger
are now decoupled - recurrence fires on a new finding matching ANY
earlier-remediated finding's cluster key in the same change, clustered or not.
(4) The draft asserted the policy version stays `change-risk/v1`; the
amendment changes the closed result envelope and escalation outcomes, so by
the versioning rule's letter it increments. Retained at `v1`, but the
precondition is now a stated rule - the version increments only once an
artifact has been emitted or a record persisted (ADR 0027) - because this is
the second amendment to rely on unwritten precedent.

Synthesis persisted: the rewritten amendment, ADRs 0026 and 0027, three
`CONTEXT.md` glossary terms (`cluster key`, `cluster`, `within-change cluster
recurrence`), and issue brief I7. Ownership: I7 owns the vocabularies and
cluster-key derivation in the policy source; I2 owns the transitions; I3 owns
the record fields; I4 consumes persisted cluster events with thresholds
unchanged.

Sequencing constraint recorded in I7 and the amendment: I1's pinned
pre-simplification ablation baseline fixture MUST be rendered AFTER I7 lands.
Pinning it first captures a prompt shape without the two vocabularies, and
I6's context-ablation comparison would then measure two different prompt
shapes rather than the projection change it intends to evaluate.

Known risks carried into implementation: a reviewer mislabelling either
component silently splits a cluster with no mechanical detection (degrades to
pre-amendment behavior rather than failing loudly); the recurrence trigger
fires readily by design, so two loosely related findings sharing a key across
rounds will demand a guard, absorbed by the impracticality escape; and
reviewer prompt context grows by an estimated 15-20 identifiers, cutting
against the parent spec's footprint goal.

G3 added 2026-07-28, same day, correcting a hole in the amendment approved
hours earlier: PR #139's automated review found that amendment 002's
within-change recurrence trigger is not evaluable by a resumed orchestration.
`ChangeRiskOrchestrationStateV1` carries per-round blocker counts and
UNRESOLVED fingerprint checkpoints, but the trigger needs the cluster keys of
REMEDIATED findings - a different set that no carried field records. The
learning record cannot substitute because it is persisted only after a
terminal state is reached. A continuously-running orchestration is unaffected,
so the defect is intermittent: an orchestration that pauses between
remediation rounds silently misses recurrences and degrades to exactly the
patch-by-patch behavior 002 exists to prevent, with no signal. Amendment 003
(human-gated, draft) adds per-completed-round remediated cluster keys to the
handoff record using the same inline-or-durable-reference mechanism the
approved contract already uses for fingerprint checkpoints, and bounds guard
demands at one per cluster key per change by escalating a post-guard
recurrence to `NEEDS_HUMAN_REVIEW`. Its acceptance criteria require the
regression test to reconstruct a resumed owner from a serialized record, since
an in-memory test would pass against the broken contract. Version stays
`change-risk/v1` under ADR 0027's emission precondition. 003 must land before
I2 implements the trigger; I7, I3, and I4 are unaffected.

I1 first RED-first cycle completed 2026-07-28, a disclosed partial slice
covering only architecture-rescue candidate R1 - the prerequisite the brief's
own Behavior Slice names ("Before adding the prompt, establish one immutable
review-policy/content source"). Added `packages/compiler/src/change-risk-policy.ts`
(994 lines, pure data plus pure predicates, no I/O, imported by nothing but its
own test) holding every closed `change-risk/v1` value verbatim from the parent
spec: the 11 `ChangeRiskDomain` identifiers, the 9
`change-risk-categories/v1` identifiers with an empty v1 alias table and
`uncategorized` fallback, result statuses, priorities, the 5 dispositions, 4
resolutions, 3 terminal statuses plus the separate `external-only` legacy
status, evidence kinds, pipeline order, the limits (3 fix rounds / 6 logical
invocations / 2 transient retries / 2 final confirmations), the 3 confirmation
triggers, and a closed 7-surface high-risk table as deterministic globs plus
contract-level predicates. Exposes the five spec-mandated projections
(`reviewer`, `orchestration`, `learningRecord`, `promotion`, `evaluation`),
each derived from the shared constants rather than restating literals, all
deep-frozen. RED proof: the test file was written and run first, failing
`ERR_MODULE_NOT_FOUND` on the not-yet-existing module. Spec review returned
ISSUES_FOUND with three real defects, all fixed RED-first: (F1, P1) the new
module emits four `dist/change-risk-policy.*` artifacts into the packed
tarball, and `fixtures/npm-pack/agent-profile-compiler.json` is an exact list,
so `npm run verify:pack` failed with "Unexpected in pack output" - the
implementer's "no generated-output change" claim was true of compiler output
but false of packed output; fixed by hand-adding the four paths (nothing in
the repo regenerates that fixture) and the break is now confirmed closed; (F2,
P2) the documentation-only short-circuit vetoed an entry BEFORE both the glob
and contract predicates, so a path explicitly declaring a closed contract, or
a generated-ownership Markdown artifact, was silently non-high-risk - narrowed
so a documentation path simply matches nothing on its own and can never
suppress a real match; (F3, P2) `normalizePath` handled only backslashes and a
single leading `./`, so `docs/../packages/compiler/src/write-plan.ts` evaded
the atomic-writes gate - now resolves `.`/`..`, collapses duplicate
separators, and strips a leading `/`, canonicalizing rather than throwing
because the manifest is machine-produced and a classification outage is the
worse failure mode for a gate on the final clean-room confirmation. Code-quality
review found one Important item: `isChangeRiskDocumentationOnlyPath` and its
glob table were left exported but unreferenced AND contradicted the classifier
on real inputs (`.claude/CONTEXT.md`, `.codex/notes.mdx`), so the next cycle
was likely to wire them back in as a veto and reopen F2 - deleted both rather
than renamed, since the spec rule is now enforced structurally (the closed
high-risk glob set contains no documentation-only path) and the two F2
precedence tests stand as the regression guard. Also fixed: three
forbidden-substring projection assertions were permanently vacuous
(`"ablation"`, `"fixRound"`, `"promotion"` appear nowhere in the module), now
replaced by an `assertExcludesForeignToken(subject, owner, token)` helper that
asserts the token is absent from the subject projection AND genuinely present
in its owning projection, so a token that stops existing fails loudly instead
of passing silently; two `as never` casts narrowed; a redundant
`mapped !== undefined` guard removed. Tests: `packages/compiler` 376/369, 0
failures, 7 pre-existing POSIX-only skips on win32; `npm run check` (`tsc -b` +
`tsconfig.test.json --noEmit`) and `npm run verify:pack` ("passed for 8
packages") both clean. Generated bytes unchanged - no diff under `fixtures/`
(beyond the pack manifest), `.claude/`, `.agents/`, `.codex/`, or `.tabnine/`.

State stays `ready`, not `done` - most of I1's acceptance criteria remain open
for later cycles: no `change-risk-reviewer` agent/subagent definition is
emitted for Codex or Claude and no orchestration surface references it; no
reviewer prompt exists, so the clean-room/snapshot-access/domain-applicability/
evidence/fingerprint/read-only criteria are unmet; no `critical-reviewer`
model-policy wiring or its mapping-v2/v3/target-native-effort/exact-override
fixtures; artifact-level projection tests (inclusion/exclusion is proven at the
policy-source level only, since no artifact consumes it yet); the pinned
pre-simplification un-projected baseline evaluation fixture; and envelope
validation. Two items need an explicit decision in a later cycle rather than
silent adoption: the `ChangeRiskContractId` set (`permission-model`,
`secret-handling`, `atomic-write-ownership`, `release-workflow`,
`network-process-boundary`, `generated-region-ownership`,
`published-package-seam`) and the baseline identity string
`change-risk-v1-unprojected-policy-baseline` are both inventions with no
parent-spec text behind them, and the contract ids became genuinely
load-bearing after F2. The typed `ChangeRiskFindingV1`/`ChangeRiskResultV1`/
`EvidenceReference`/`ChangeRiskOrchestrationStateV1` shapes and the shared
deterministic fingerprint normalizer must land in this module, not in the
reviewer prompt, or R1's "one authoritative owner" rule is defeated - the
envelope relationship rules currently exist only as prose inside
`reviewer.resultInterface.invalidAttemptRules`. Smaller disclosed follow-ups:
`normalizePath` matching stays case-sensitive (undecided, untested on a safety
gate); the hand-rolled matcher/canonicalizer could move to
`change-risk-path-match.ts`; `matchSegment`'s `a**b` branch is unreachable
against the closed glob table; and the module is deliberately not re-exported
from `packages/compiler/src/index.ts`, so the four packed `dist` artifacts are
currently inert payload - pair the re-export with that fixture when a consumer
lands.

I1 PR review rounds 1-3 (2026-07-28, PR #139) resolved 25 automated P2
findings across three rounds. Rounds 1-2 (14 findings) were individual
corrections: missing process-execution and generated-ownership globs, prose
independently restating closed numeric limits, a `dispositionConfirmed` with
no owner-evidence field, bare evaluation metric identifiers with no
measurement definitions, a budget-reservation boundary with no valid state
transition, absent promoted-rule content constraints, execution counters keyed
on an undefined "local record" rather than `sourcePolicy`, a missing
no-open-blocker terminal transition, a category set the reviewer projection
never listed, and a date format carrying shape without the UTC basis. One
round-2 finding was a defect a round-1 fix had introduced: `needs-context-rate`
was defined over completed logical invocations, which a `NEEDS_CONTEXT` result
by contract never is, so the metric would have read a constant zero.

Round 3 stopped patching. Four of its eleven findings were the same defect
class in its third consecutive appearance - the high-risk glob table
enumerates known files, so it keeps missing newly added ones. Correction
2026-07-28: the guard was originally justified here (and in commit d3ef825's
message and three PR replies) by the promotion contract's third-occurrence
rule; that citation was wrong. The occurrence unit is one reviewed change, so
three rounds inside one change deduplicate to a single occurrence and the
third-occurrence rule cannot fire. The accurate authorization is the
promoted-rule lifecycle's discretionary clause - "a mechanical or
interface-level guard MAY be introduced before the third occurrence when it
is clearly practical and proportionate" - which this plainly was. The gap
that made the wrong citation tempting (no within-change trigger exists at
all) is the subject of the proposed amendment 002 below. Added
`packages/compiler/src/change-risk-surface-coverage.test.ts`, which scans
`apps/`, `packages/`, `scripts/`, and the repository root and asserts the
closed table covers what it claims, reading the generated-output list from
`PHASE_14_SUPPORTED_PATHS` rather than hand-typing it. On first run it caught
all four reviewer-reported files plus three the reviewers missed
(`create-bump-commit.mjs`, `guards.mjs`, `verify-pack-files.mjs` all import
`node:child_process` and were covered by `release-workflows`/
`published-packages` but not by the process-execution surface itself), and two
further hits proved to be wrong detectors rather than a wrong table (a
same-origin fetch reached through a variable binding, and a module that only
re-exports the atomic-write symbols) and were fixed as detectors. Guard
verified load-bearing by mutation: removing one glob fails the suite and names
the offending path. Also narrowed `fixtures/**` to `fixtures/*/expected/**`,
which was a false positive in the opposite direction - it classified manual
fixture inputs as generated ownership and would have forced an unnecessary
confirmation and consumed reservation budget.

Four round-3 findings were deliberately NOT implemented and are owned by their
own briefs, not I1: preregistered per-target absolute rate caps for false
positives/`NEEDS_CONTEXT`/malformed envelopes, total validated-blocker
recovery and run-variability metric definitions, and zero-denominator
behavior for the false-positive rate on a `CLEAN` run all belong to I6's
evaluation harness; recording why a third-occurrence mechanical guard is
impractical belongs to I4's promotion bookkeeping. The parent spec's
composition contract makes the evaluation projection's only consumer the I6
harness, so I1 fixing that harness's measurement policy now would repeat the
same unstated-invention problem spec review already flagged against the
`ChangeRiskContractId` set. I2/I4/I6 should pick these up rather than treat
them as closed.

Residual limits of the guard, disclosed rather than hidden: it is a textual
scan, so a process launch reached through an indirection it cannot see (a
dynamically built import, a spawn wrapper re-exported from another package)
still slips past; the same-origin `fetch` heuristic resolves one level of
variable binding and reports anything more indirect as outbound, which fails
safe toward extra confirmation; it scans only `apps/`, `packages/`,
`scripts/`, and the root, so a boundary in a new top-level directory is
invisible until `SCANNED_ROOTS` is extended; and the atomic-write detector
keys on two named entry points, so a third atomic-write API must be added to
`ATOMIC_WRITE_ENTRY_POINTS` - the same enumeration weakness one level up,
though far narrower than enumerating call sites.

PR #140 automated review, unresolved-findings round (2026-07-30): six findings
closed, two of them one root cause. The shared cause of the two P1s is that
state recording blocker CLOSURE was trusted rather than derived - a fix round
recorded whatever `remediatedFindings` the caller passed (so fixing a
clusterable blocker with an empty array left `remediatedClusterKeys` empty and
the mechanical-guard transition never fired), and the validator checked only
that active fingerprints appeared somewhere in history, so a serialized
handoff could retain a completed blocker round while dropping the checkpoint
entirely and then reach `CLEAN` with no prior fingerprints to account for.
Both are now derived: remediated cluster keys come from the active checkpoint
the round carried, a claim naming a non-active fingerprint or key escalates,
and the record carries `activeCheckpointFromRound` with the checkpoint
required to equal exactly the unresolved fingerprints at and after that index.
The index advances past every round only when a validated clean review closed
them, checked against the record's own clean-review count; `code-changed` now
carries the checkpoint forward instead of resetting it, which is what makes
that binding hold. Three independent defects: a branded external review was
forced through remediation validation, so an external P1/P2 reporting only its
own finding was treated as a malformed local attempt and consumed retries (it
now validates independently and never spends a confirmation slot); the
fix-round reservation checked the six-invocation budget but not the separate
two-confirmation cap, so a fix could start that inevitably needed a third
confirmation; and the evidence validator never checked `path`, `symbol`, or
`commit` when the evidence kind did not require them, so `commit: {}` was
accepted and returned as a typed `ChangeRiskResultV1`. The sixth was contract
drift, not code: the implementation emits `change-risk/v2` (ADR 0027's first
post-emission increment) while the parent spec, both amendments, and the
sequenced I3 brief still required `change-risk/v1`, which would have made the
next slice persist an incompatible policy value - the specs and briefs now
name v2, with the pre-emission reasoning kept as history. Test-side
consequence worth noting: several fixtures hand-built round histories with an
empty checkpoint, which the transition function can never produce; they now
derive it, and one fixture that asserted a bare `CLEAN` envelope closing a
remediation round was corrected, because a remediation review closes its
checkpoint by resolving it, never by returning an envelope accounting for
nothing. Compiler suite 472 tests, 0 failures, 7 pre-existing win32 skips;
root `npm run check` clean. The `scripts/release` Phase 31 journey test fails
identically on a clean tree here (local `tar` cannot read the fixture path
containing spaces), so it is environmental, not a regression.

PR #140 automated review, second round on the fixes above (2026-07-30): four
more findings, all real, all in the same theme - the transition function
trusted assertions it could not verify. The P1s: closure coverage was gated on
`fixRounds > 0`, so a handoff with its two optional review-snapshot markers
deleted could take `code-changed` past the blocker guard and then close with a
bare `CLEAN` while a recorded blocker went unaccounted for (coverage is now
owed by any local review taken while the checkpoint is non-empty, which makes
the marker strip worthless rather than requiring the validator to reconstruct
markers that a legitimate post-fix state does not carry); and `guard-added`
discharged a required mechanical guard on the already-reviewed snapshot with
no manifest and no evidence, so the caller could assert the guard on unchanged
bytes and then patch as usual - it is now a snapshot-changing event carrying
its manifest and evidence, both persisted. The P2s: a second `fix-applied`
with no review between them incremented `fixRounds` past `completedRounds` and
returned a handoff this module's own validator rejects, which made the NEXT
transition throw rather than escalate (a fix now requires the completed review
it answers); and same-fingerprint non-progress searched every historical
round, so a finding an earlier round verifiably closed, reappearing after a
terminal clean review on new bytes, stopped the first fresh review as
`NO_PROGRESS` - it now compares against the live checkpoint, which is the set
that actually means "still open". Note the guard change implies a two-step
flow: the guard lands as its own snapshot, then the fix. Compiler suite 475
tests, 0 failures, 7 pre-existing win32 skips; root `npm run check` clean.

PR #140 automated review, third round (2026-07-30): five findings, all real.
Three P1s. The confirmation trigger "after any P1" was not derivable from the
record - completed rounds carried no priority - so a resumed low-risk handoff
could clear `confirmationRequired` and close without the mandatory
confirmation; rounds now carry `p1BlockerCount`, the record carries a sticky
`p1Observed`, and a history containing a P1 round cannot present itself as
un-observed. `clusterMembers` was optional on a serialized round, and an
omitted array is indistinguishable from "nothing clusters here", so a resumed
`fix-applied` derived no cluster keys and the guard trigger never fired; the
field is now required, empty only for genuinely non-clusterable findings.
`guard-added` changed the snapshot without incrementing `fixRounds`, making
the guard a free remediation change that bypassed the two-fix confirmation
trigger and fix-round accounting - it now goes through the same admission and
accounting path as `fix-applied` (extracted as `admitFixRound`), which also
resolves the two-commit awkwardness the previous round introduced: the guard
IS that review's fix round, and its snapshot carries the guard and the
remediation together. The P2s: the guarded-recurrence escalation incremented
`logicalInvocations` without appending its completed round, so the terminal
handoff violated the accounting invariant its own validator enforces and could
be neither resumed nor reported - every escalation now records its round
first, and a key that already has a guard is no longer demanded a second time;
and the public envelope validator had no count or length bounds before
traversing and normalizing untrusted reviewer output, so closed
`CHANGE_RISK_ENVELOPE_LIMITS` (findings, evidence per finding, missing inputs,
scope domains, any single string) are checked at the boundary before anything
walks the contents, with the string bound enforced at the single
`nonEmptyString` choke point. Limits are set far above any actionable review;
a round exceeding them could not be remediated inside the fix-round budget
anyway. Compiler suite 480 tests, 0 failures, 7 pre-existing win32 skips; root
`npm run check` clean; the release journey test still fails only on this
machine's `tar`.

PR #140 fourth review round (2026-07-30), run by the phase's OWN generated
`change-risk-reviewer` rather than the external bot, which had exhausted its
quota. The reviewer was already implemented and emitted by the compiler for any
qualifying subagent-driven profile; this repo had simply never recompiled its
own profile since I1 landed, so `agent-profile compile --target
claude-subagents --write` created `.claude/agents/change-risk-reviewer.md` and
its reference. First dogfooded run, clean-room initial mode against the
accumulated change: three findings, all verified independently before acting,
two of them reproduced by driving the exported state machine. P1: the
same-fingerprint non-progress guard was evaluated for validated EXTERNAL rounds
as well as local ones, so an independent reviewer reproducing a still-open
local blocker ended the whole workflow as `NO_PROGRESS` with every fix round
and invocation unspent - directly contradicting the external-review contract
("a validated external P1/P2 reopens the local loop when budget remains"). The
guard is now gated on `event.external !== true`, exactly as stagnation already
was; the external fingerprints merge into the checkpoint instead. Pre-existing,
not introduced by the third round: the previous `prior.some(...)` form matched
the same case. P2: `guard-added` threw a `TypeError` out of the public boundary
for a cluster key no recurrence had demanded, while every sibling condition -
including `guard-impractical` for the identical case - returns a terminal
handoff; an owner making an out-of-order claim crashed instead of receiving the
escalation it must persist. P2: `resolveEmittedSkills` force-added
`final-review` for a qualifying subagent-driven profile, but the instruction
renderer still read the raw `workflow.finalReview` flag, so a profile with
`finalReview: false` emitted the skill and a `subagent-driven-change` body
mandating it while AGENTS.md stated "Not required". All three surfaces now read
one `emitsFinalReview(profile)` predicate. The reviewer's Tabnine sub-claim
(same profile emitting the shared skill without the Tabnine checklist it
cross-references) is real in the code but UNREACHABLE: a subagent-driven
profile requires the `implementer` template, which Tabnine may not emit while
its subagents are read-only, so that profile cannot compile. The gate is
aligned anyway; no golden fixture was added for the qualifying +
`finalReview: false` combination, which remains covered by a focused compiler
test only. Compiler suite 482 tests, 0 failures, 7 pre-existing win32 skips;
root `npm run check` clean. Method note: the previous round's "check clean"
claim was wrong - it was read from `npm run check | tail -3 && ...`, whose exit
status comes from `tail`, so a real `tsc` failure in the test project reached
CI. Verify with the exit code, never through a pipe.

PR #140 fifth review round (2026-07-30), the first `remediation`-mode run of
the self-hosted reviewer. All three prior fingerprints verified `fixed` on the
reviewer's own evidence, not on any implementer claim - for the external-blocker
P1 it additionally proved the LOCAL same-fingerprint guard still fires, which is
the check that mattered, since the fix could have disabled non-progress
detection outright. Two new P2s. First: this repository's own generated
artifacts were half-emitted. The scoped `--target claude-subagents` write had
created the Claude reviewer while leaving `.codex/agents/change-risk-reviewer.toml`
absent and the committed `.claude/skills/` bodies at their pre-change templates,
so the repo shipped a reviewer agent none of its own skills invoked
(`subagent-driven-change/SKILL.md` contained zero occurrences of `change-risk`
against three in the current template) and a `final-review` skill missing the
handoff-validation clause, meaning this repo's own final review would have
accepted prose state. Closed with a full `compile --write --force`; drift is now
zero creates and zero changes apart from two deliberately local files
(`.claude/settings.json`, whose committed copy is already canonical and whose
working copy carries the owner's permission override, and the gitignored
`.mcp.json` holding the local Code Context Engine server config). Both were
backed up and restored around the compile; `--force` was required only because
the hand-written `.mcp.json` is marked `generated-owned` in the lock, which is
the ownership guard working as designed. Second: the scoped write itself
truncated `ai-profile.lock` from 27 templates and outputs to 5, silently
dropping every other target's provenance - repaired by hand in ec03e35 after
confirming no surviving entry differed. The reviewer located the cause the
hand investigation had missed: `apps/cli/src/compile-plan.ts` `buildCompileWrites`
builds `createLockfileFile` purely from the scoped subset, while
`resolveTabnineModelSettings` in the same file already re-reads the prior lock
to preserve one output on exactly that path - so the truncation was known and
handled for one case and unhandled generally. That CLI defect is tracked
separately and is NOT fixed on this branch; phase-27's lockfile-conformance
contract is the governing spec. Compiler suite 482 tests, 0 failures, 7
pre-existing win32 skips; root `npm run check` clean (exit code, not a pipe).

I3 implemented 2026-07-31, flipped from `sequenced` after confirming its only
stated blocker (`I1 -> I3`) was already `done`. Adds
`packages/compiler/src/review-learning-record.ts`: the `review-learning/v1`
record contract and a deterministic Markdown renderer, consuming I1's
learning-record projection for every closed value rather than restating one.
The validator owns the record's own relationships, which is where the
schema's real content lives: local and legacy-external terminal statuses are
disjoint and neither may borrow the other's; a local record must carry its
execution counters and a `legacy-external` record must omit rather than
fabricate them; provenance is per round AND per finding, so a local run that
incorporates an external finding stays a local record; an external finding
names its provider (`unknown` when unidentifiable) and a local one may not
carry one; every P3 carries exactly one disposition plus a confirmation
marker, and an open P3 carries the owner's decision evidence; P1/P2 carry
none; a validated P1 carries its systemic classification; a `false-positive`
requires invalidating evidence; fingerprints are unique within a record; the
date is the UTC calendar date, with offsets and timestamps rejected outright
because a local date can differ from the UTC one around midnight. Amendment
002's cluster fields are per round and are refused on a `legacy-external`
record rather than fabricated, kept separate from category counts so I4's
recurrence counting is not corrupted (ADR 0026).

Committed documentation is `docs/review-learning/README.md`, pinned by a test
that walks the projection's own `requiredFields` and asserts each is
documented, so the doc cannot silently fall behind the contract.
`docs/review-learning/template.md` is rendered by the same renderer the
validator pairs with, so template and schema cannot drift. The generated
`subagent-driven-change` skill now instructs persisting exactly one record per
reviewed change, with the path prefix, schema version, source policy, and the
redaction rules all interpolated from the projection.

RED proof was the brief's: the schema test failed with
`ERR_MODULE_NOT_FOUND` because no record contract existed. Disclosed limits.
The secret-shaped-evidence guard reuses the repository's single sanctioned
`containsSecretLikeLiteral` detector rather than adding a second one; its
reach is the assignment form (`api_key: ...`, `token = ...`), the
`SECRET_TOKEN_VALUE` sentinel, and PEM headers, so a bare high-entropy literal
with no prefix is NOT caught - a guard against the common accident, not a
redaction proof, and the test says so. The `false-positive` check looks for
invalidating language in evidence text rather than a structured marker,
because the record's evidence rows are prose locators; a structured
`invalidatesPriorFinding` marker exists on the reviewer envelope but not on
the persisted row. No record was written for PR #140 itself: the change has
not reached a terminal status - the last review returned `NEEDS_CONTEXT` -
and manufacturing a terminal status to make the slice look finished is exactly
what the contract forbids. Historical PRs remain I5's backfill. Compiler suite
489 tests, 0 failures; CLI 610; root `npm run check` clean; goldens and
this repository's own skills regenerated. The new module also emits four
`dist/review-learning-record.*` artifacts into the packed tarball, and
`fixtures/npm-pack/agent-profile-compiler.json` is an exact list that nothing
regenerates, so `verify:pack` failed until they were hand-added - the same
trap I1 hit, caught here only because that entry above records it.

PR #140 merged 2026-07-31 (squash), carrying I1, I2, I7, and I3 plus the
phase-27 scoped-compile lockfile fix. Merged rather than extended because the
phase's own reviewer had twice failed to review the branch inside its budget:
110 files and +13,694 lines is past what a clean-room reviewer that re-reads
the whole change each round can cover. That the instrument this phase built
was the thing that said so is the useful part. Lesson for the next branch,
recorded rather than resolved: it also drifted across phases, carrying CLI
lockfile work that belonged in its own change.

Ledger movement after the merge: I3 landing satisfies `I1+I3 -> I4`, so I4
moves from `sequenced` to `ready`, and satisfies `I3 -> I5`, so I5's
dependency is met though it stays `human-gate` on its own approval. I8 added
`ready`.

I8 raised from the two failed review runs. Correcting an earlier claim in this
ledger: raising the reviewer's turn budget from 10 to 18 was recorded as a fix
and was not one - the second run failed identically. The root cause is not the
size of the constant. The emitted prompt lists its constraints (read-only, no
installs, no network) and says to return `NEEDS_CONTEXT` when required proof
cannot be obtained within them, but the turn budget is not named among those
constraints, so the reviewer never treats exhaustion as a trigger. It spends
every turn inspecting and returns no envelope, which the orchestration can
only read as an invalid attempt and retry into the same wall. The decisive
evidence is what the second run produced once manually resumed: a well-formed
`NEEDS_CONTEXT` naming five specific unverified items, one of them a real
defect nobody else had found. The capability is already there; the prompt
never gives it a turn to use it. I8 names the budget as a constraint and
requires reserving enough of it to emit the envelope. Raising the number again
is an explicit non-goal, as is the larger question of invoking the reviewer
against a bounded per-slice snapshot - that stays open for I6 to measure
first.

PR #140's own review history is NOT a candidate for an I3 record, correcting a
suggestion made while implementing I3. Its reviews were run ad hoc, mixing
external bot rounds with local reviewer runs and no orchestration state
machine behind them, so a `change-risk/v2` record would have to fabricate the
invocation and attempt counters the schema requires. It is backfill, and I5
owns backfill.

## phase-34: Bounded Pre-Implementation Spec Review (`docs/specs/phase-34/001-bounded-spec-review.md`)

Draft 2026-07-27, pending grill approval; the spec itself is human-gated.
Adds a budgeted clean-room spec-review loop after grill approval and
synthesis persistence, with a zero-P1 stop rule, explicit residual
dispositions, and a ledger gate on implementation dispatch. Motivated by
the phase-33 PR #134 review history (nine rounds, 71 findings, 12 P1s,
all pre-implementation).

| Id  | Task                                       | State      | Brief                                                                                                       |
| --- | ------------------------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------- |
| G1  | Grill session: approve the phase-34 spec   | human-gate | [001-bounded-spec-review.md](docs/specs/phase-34/001-bounded-spec-review.md)                                |
| I1  | Define the spec-review policy and reviewer | blocked    | [001-spec-review-policy-and-reviewer.md](docs/specs/phase-34/issues/001-spec-review-policy-and-reviewer.md) |
| I2  | Integrate the bounded loop and ledger gate | sequenced  | [002-spec-review-loop-integration.md](docs/specs/phase-34/issues/002-spec-review-loop-integration.md)       |
| I3  | Validate the published spec-review loop    | sequenced  | [003-spec-review-validation.md](docs/specs/phase-34/issues/003-spec-review-validation.md)                   |

Dependency map: G1 -> I1; phase-33 I1 + I3 -> I1; I1 -> I2; I1+I2 -> I3.
I1 is blocked on both the spec approval (G1) and the phase-33 shared policy
source and record schema it consumes.
