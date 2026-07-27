# Spec: Change-Risk Review Assurance and Learning

## Status

Approved on 2026-07-24. Synthesized from the approved change-risk review
grill agreement of the same date.

Amended on 2026-07-27, before any I1 implementation, to add context
composition and ownership, snapshot disclosure, a typed reviewer interface,
single orchestration ownership, learning-record context isolation,
promoted-rule lifecycle, and context-ablation evaluation contracts, and to
close the open review findings on PR #134. Because no `change-risk/v1`
artifact has been implemented or released, the workflow-policy version
remains `change-risk/v1`.

## Problem

The generated implementation workflow can report spec compliance and
acceptable code quality while a later pull-request review still finds
important correctness, integration, safety, compatibility, and runtime-proof
gaps. The current reviewers are anchored to the task, spec, changed-file list,
and implementer report. They do not provide a fresh adversarial review of the
complete accumulated change and its unchanged consumers.

The July 2026 sample that triggered this change covered PRs #125 and
#127-#133: 126 findings in total, including 23 P1 and 103 P2 findings. Repeated
classes included cross-consumer integration, preview-before-write ordering,
ownership and atomicity, network/process boundaries, parser and version
contracts, published-package seams, runtime sentinels, state classification,
and secret-like output.

## Goal

Generated Codex and Claude workflows add an independent
`change-risk-reviewer` after spec and code-quality review. The orchestration
gives the reviewer complete and lossless access to the change snapshot,
applies a bounded remediation policy,
records every review round in a versioned Markdown learning record, and
promotes repeated validated findings into scoped review rules and mechanical
guards.

## Intent

Separate compliance, maintainability, and product-risk objectives instead of
trying to make one reviewer perform all three. Give the final risk reviewer
fresh context and the whole accumulated change so an incomplete spec,
cross-cycle inconsistency, or unchanged consumer can still be challenged.
Turn validated review misses into durable local learning without adding hosted
telemetry or making GitHub a dependency.

## Decision Rules

1. Review-objective doubt -> use an independent change-risk review rather
   than broadening the spec or quality reviewer.
2. Scope doubt -> inspect the complete change snapshot and reachable
   consumers, never only a supplied changed-file list.
3. Anchoring doubt -> initial and final clean-room reviews omit implementer
   claims, prior praise, and prior finding lists.
4. Priority doubt -> P1 and P2 block; P3 does not block but requires a
   disposition.
5. Progress doubt -> compare stable finding fingerprints and blocker counts;
   repeated non-progress escalates instead of consuming unlimited retries.
6. Learning doubt -> keep normalized evidence and dispositions in committed
   Markdown; keep raw reviewer transcripts local and ignored.
7. Promotion doubt -> first systemic P1 gets immediate protection; ordinary
   recurrence moves from record, to rule, to mechanical guard.
8. Provider doubt -> external review is an optional independent signal, never
   a required online dependency.

## Non-Goals

- Reproducing a hosted review provider's private prompt, model, or
  infrastructure.
- Hosted telemetry, source upload, secret upload, or remote execution.
- A new CLI telemetry command or runtime analytics service.
- Making GitHub, pull requests, or network access mandatory.
- Unlimited reviewer or remediation loops.
- Blocking completion on P3 findings that have an explicit disposition.
- Automatically editing generated `AGENTS.md` regions or bypassing human-owned
  instruction boundaries.
- Adding a new `ai-profile.yaml` option for this first change.

## User Flow

1. `implement-next` dispatches the bounded implementation task.
2. The implementer, spec reviewer, and code-quality reviewer run in their
   existing order.
3. A fresh `change-risk-reviewer` receives the governing contracts, scoped
   repository review rules, and complete and lossless access to the change
   snapshot via its manifest and read instructions.
4. The reviewer inspects the changed code plus unchanged consumers, call
   paths, state transitions, ownership, compatibility, published seams,
   runtime proof, and external boundaries.
5. Validated P1/P2 findings return to one bounded fix batch. P3 findings
   receive a recorded disposition.
6. A remediation review examines the complete updated snapshot, verifies
   earlier fingerprints, and searches for new findings.
7. The workflow stops clean, reports `NO_PROGRESS`, or escalates to
   `NEEDS_HUMAN_REVIEW` according to the bounded policy.
8. The normalized review result is committed under
   `docs/review-learning/`; raw transcripts remain local and ignored.
9. Recurring validated categories are promoted according to the agreed
   thresholds.

## Inputs

- Approved task/spec, non-goals, acceptance criteria, and repository review
  rules.
- Complete committed `base...HEAD` diff for a PR workflow.
- For an uncommitted local workflow, the same accumulated committed diff plus
  staged and unstaged patches and every identified relevant untracked file as
  one change snapshot; no commit or staging mutation is required solely for
  review.
- Base and head commit identifiers. Whenever staged, unstaged, or untracked
  content participates in the snapshot, a deterministic worktree snapshot
  identifier over the exact reviewed byte set is required so that different
  reviewed contents can never share the same snapshot identity; for a purely
  committed snapshot it is optional.
- Prior finding fingerprints for remediation reviews only.
- Existing provider-neutral `critical-reviewer` model-policy resolution,
  including mapping-v2, mapping-v3, and exact per-client overrides.
- Sanitized checked-in historical review fixtures. A live review-thread read
  is an optional replacement input only after explicit user approval.
- External review findings when the user has independently requested or
  enabled that provider.

## Outputs

- Generated Codex and Claude `change-risk-reviewer` definitions.
- Updated generated `subagent-driven-change`, `implement-next`, and
  `final-review` instructions.
- A normalized Markdown learning record per reviewed PR/change.
- Scoped `## Code Review Rules` additions or proposed manual patches after a
  promotion threshold is met.
- Explicit clean, `NO_PROGRESS`, or `NEEDS_HUMAN_REVIEW` outcomes.
- Golden fixtures, contract tests, and forward-evaluation evidence for the
  generated workflow.

## Contracts

### Review policy version contract

- The initial workflow-policy version is `change-risk/v1`.
- The reviewer result envelope, orchestration skills, and
  `review-learning/v1` records produced by this workflow MUST emit the same
  exact workflow-policy version. Records normalized from reviews that this
  workflow did not execute carry `sourcePolicy: legacy-external` instead of a
  fabricated policy version.
- Increment the workflow-policy version when changing snapshot completeness,
  the closed result envelope, priority/disposition semantics, retry or
  confirmation limits, escalation outcomes, high-risk triggers, or promotion
  thresholds. Editorial clarification that preserves those contracts does not
  increment it.

### Context composition and ownership contract

- Every consequential instruction or closed policy value MUST have exactly one
  authoritative owner.
- The shared change-risk policy MUST expose surface-specific projections rather
  than rendering the complete policy into every generated artifact.
- The reviewer projection contains only:
  - reviewer objective and authority boundary
  - snapshot-access contract
  - applicable risk-domain rubric
  - finding/result interface
  - read-only and safety constraints
- The orchestration projection contains only:
  - pipeline order
  - invocation and fix-round budgets
  - retry, invalidation, non-progress, confirmation, and escalation transitions
- The learning-record projection contains only:
  - normalized record schema
  - redaction requirements
  - persistence location and ownership
- The promotion projection contains only:
  - recurrence classification
  - scoped-rule and mechanical-guard actions
  - ownership and retirement rules
- Generated surfaces MUST reference their authoritative projection instead of
  restating unrelated policy sections.
- Retry counts, promotion thresholds, learning-record fields, and historical
  examples MUST NOT be embedded in the change-risk reviewer prompt unless the
  reviewer requires them to produce its own result.
- Risk-domain descriptions MUST NOT be repeated independently across reviewer
  and orchestration skills.
- Exactly one generated surface owns the complete change-risk state machine:
  `subagent-driven-change`. `implement-next` initiates or resumes that
  orchestration and reports its current state without redefining budgets or
  transitions. `final-review` verifies that an allowed terminal state exists
  without reimplementing the review loop. Nested or wrapping surfaces MUST
  verify or propagate the owner's terminal result rather than invoke another
  review of the same snapshot.
- These composition rules are provider-neutral: they apply to Codex and Claude
  artifacts now and to any future Tabnine equivalent.
- Hard safety, permission, ownership, and no-upload contracts remain explicit
  even when other guidance is simplified.

### Snapshot disclosure contract

- Snapshot completeness means that no changed, staged, unstaged, or relevant
  untracked file is hidden from the reviewer.
- Snapshot completeness does not require eagerly inserting every file and diff
  byte into the initial reviewer prompt.
- The initial reviewer context SHOULD contain:
  - snapshot identifier
  - base and head identifiers
  - deterministic changed-file manifest
  - staged, unstaged, and relevant-untracked classifications
  - governing contracts and applicable repository-rule references
  - instructions for reading the complete diff and reachable consumers
- The reviewer MUST be able to inspect every snapshot component and any
  unchanged consumer required to complete the review.
- A `CLEAN` result requires explicit confirmation that the complete manifest
  was covered, including any skipped or non-applicable risk domains.
- Context retrieval MUST remain local and MUST NOT weaken the no-upload
  contract.

### Reviewer contract

- The pipeline order is:
  `implementer -> spec-reviewer -> code-quality-reviewer ->
change-risk-reviewer -> final-review`.
- The change-risk reviewer is review-only and MUST NOT edit the change.
- `change-risk-reviewer` is the generated agent/reviewer identifier, but its
  provider-neutral model-policy role is the existing `critical-reviewer`.
  Mapping-v2, mapping-v3, target-native effort, and exact per-client overrides
  MUST resolve through that role; this phase adds no new model-policy role ID.
- The initial review MUST use a fresh reviewer with complete and lossless
  access to the change snapshot under the snapshot disclosure contract. It
  MUST NOT receive the implementer report, prior praise, or a prior finding
  list.
- Remediation reviews MUST inspect the complete updated snapshot, verify known
  fingerprints, and search independently for new findings.
- A final clean-room confirmation, when required, MUST use a fresh reviewer
  without a prior finding list.
- The change-risk domains are a closed identifier set (`ChangeRiskDomain`) in
  the shared policy source covering: unchanged consumers and call paths, state
  transitions, ownership and write safety, compatibility and platform
  behavior, parsing and validation order, external network/process
  boundaries, generated-file ownership, published-package seams, runtime
  proof, redaction, and contract completeness.
- Short domain names and applicability requirements remain in the reviewer
  interface. Detailed domain rubrics, known failure patterns, and evidence
  expectations live in selectively loaded reference material, not in every
  reviewer invocation prompt.
- The reviewer MUST evaluate every applicable domain but MUST NOT manufacture
  findings merely to satisfy a checklist. Inapplicable domains are explicitly
  marked `not-applicable` with a concise reason.

### Reviewer interface contract

- Findings and results use the closed typed shapes below; the orchestrator,
  not free-form reviewer prose, validates their relationships.

```ts
type ChangeRiskFindingV1 = {
  priority: "P1" | "P2" | "P3";
  category: ChangeRiskCategory;
  location: {
    path: string;
    symbol?: string;
    line?: number;
  };
  unsafeCondition: string;
  evidence: EvidenceReference[];
  affectedContract: string;
  safePath: string;
  resolution: "open" | "fixed" | "false-positive" | "obsolete";
  disposition?:
    | "fixed"
    | "accepted-debt"
    | "follow-up"
    | "false-positive"
    | "obsolete";
  fingerprint: string;
};

type ChangeRiskResultV1 = {
  policyVersion: "change-risk/v1";
  snapshotId: string;
  status: "CLEAN" | "FINDINGS_FOUND" | "NEEDS_CONTEXT";
  scope: {
    completed: boolean;
    inspectedChangeManifest: boolean;
    inspectedRelevantConsumers: boolean;
    domains: Array<{
      domain: ChangeRiskDomain;
      applicability: "applicable" | "not-applicable";
      reason?: string;
    }>;
  };
  findings: ChangeRiskFindingV1[];
  missingInputs: string[];
};
```

- `missingInputs` MUST be empty except for `NEEDS_CONTEXT`.
- `scope.completed` MUST be `true` only for `CLEAN` or a completed
  findings result.
- P1/P2 findings MUST reject `disposition`; P3 findings MUST carry one valid
  `disposition`.
- `CLEAN` is valid only for the requested snapshot with an empty findings
  array and an explicit completed-scope confirmation covering the complete
  manifest and every domain's applicability. `FINDINGS_FOUND` requires at
  least one structurally valid finding. `NEEDS_CONTEXT` requires a non-empty
  `missingInputs` list and is not a completed review.
- Empty, truncated, unparseable, version/snapshot-mismatched, internally
  inconsistent, or otherwise malformed output is an invalid attempt, never a
  clean review.
- The fingerprint is derived from structured components —
  `category + affected contract + normalized location + unsafe-condition
  class` — where practical. The reviewer may supply those components; shared
  deterministic code normalizes the final fingerprint so it survives wording
  changes across rounds.

### Priority and disposition contract

- Every validated P1 and P2 blocks completion regardless of count.
- Every P3 is non-blocking but MUST use exactly one disposition:
  `fixed | accepted-debt | follow-up | false-positive | obsolete`.
- Every finding MUST use exactly one resolution:
  `open | fixed | false-positive | obsolete`.
- `disposition` is required for P3 and MUST be absent for P1/P2. A P3
  disposition of `fixed`, `false-positive`, or `obsolete` uses the matching
  resolution; `accepted-debt` and `follow-up` remain `open`.
- A false positive MUST include the evidence that invalidates it.
- Any code change invalidates the preceding clean result.

### Retry and escalation contract

- The initial review is not a fix round.
- At most three fix rounds may follow the initial review.
- At most six logical reviewer invocations may complete: the initial review,
  up to three remediation reviews, and up to two final clean-room
  confirmations. The second confirmation exists only for the path where a
  required confirmation of an initially clean high-risk change discovers
  blockers, remediation follows, and a new confirmation is then required.
- A fix round may begin only when the remaining logical-invocation budget can
  accommodate its remediation review plus any final clean-room confirmation
  that would then be required. When it cannot, the workflow escalates to
  `NEEDS_HUMAN_REVIEW` instead of finishing without the required
  confirmation.
- One logical reviewer invocation may retry a transient capacity/tool failure,
  invalid result envelope, or `NEEDS_CONTEXT` result at most twice after the
  missing input is supplied. Failed or incomplete attempts are recorded
  separately and do not become review findings or fix rounds.
- The same unresolved fingerprint appearing twice without progress produces
  `NO_PROGRESS`.
- Failure to reduce the blocking-finding count across two consecutive
  remediation reviews produces `NO_PROGRESS`.
- Remaining P1/P2 findings after the third fix round produce
  `NEEDS_HUMAN_REVIEW`.
- Exhausted attempt retries produce `NEEDS_HUMAN_REVIEW`; they MUST NOT be
  converted to a clean result.
- When two or more terminal triggers apply to the same transition,
  `NEEDS_HUMAN_REVIEW` takes precedence over `NO_PROGRESS`.
- A completed `FINDINGS_FOUND` result whose findings are exclusively P3 with
  a valid disposition each contains no blocker. It reaches terminal `clean`
  exactly as a `CLEAN` result would — without relabeling the reviewer
  envelope and without an additional review of the unchanged snapshot —
  subject to the same required-confirmation triggers.
- Initial or remediation review against an unchanged snapshot is not
  repeated. A required final clean-room confirmation is the sole exception:
  it intentionally re-reviews the same final snapshot as an independent
  logical invocation.
- Final clean-room confirmation is required after any P1, after two or more
  fix rounds, or when the change touches permissions, secrets, atomic writes,
  release workflows, external network/process execution, generated
  ownership, or published packages.

### Review-learning record contract

- Committed normalized records live under `docs/review-learning/`, one file
  per PR/change.
- Raw prompts, transcripts, hidden reasoning, and unfiltered tool output MUST
  remain in a local ignored location and MUST NOT be committed.
- The normalization-schema version (`review-learning/v1`) is separate from
  the policy that produced the review. Every record carries a closed
  `sourcePolicy` value: `change-risk/v1` for reviews executed by this
  workflow, or `legacy-external` for reviews that predate it or come from an
  external provider.
- Schema version `review-learning/v1` requires: date, product version when
  known, source policy, base/head identifiers, worktree snapshot identifier
  when uncommitted content participated, reviewer surface/version when known,
  round outcomes, stable finding fingerprints, category, priority, evidence,
  affected contract, safe path, resolution, conditional P3 disposition, and
  terminal status.
- Logical-invocation and transient-attempt counts are required only for
  `sourcePolicy: change-risk/v1` records. `legacy-external` records omit
  them instead of fabricating provenance.
- Terminal status is one of:
  `clean | no-progress | needs-human-review`.
- Unknown provider or model versions are recorded as `unknown`, never guessed.
- Records SHOULD reference commits, paths, symbols, contracts, and tests
  rather than reproducing source, specs, or full reviewer explanations.

### Learning-record context isolation

- Historical review-learning records MUST NOT be loaded wholesale into initial
  or final clean-room reviewer context.
- Initial and final reviewers receive no historical finding list, recurrence
  counts, expected categories, or prior reviewer conclusions.
- Remediation reviews receive only fingerprints from the immediately preceding
  relevant round.
- Promotion logic may query normalized historical records by category.
- Forward-evaluation harnesses may use records to select evaluation cases, but
  expected findings and category labels MUST be stripped from reviewer input.
- Historical findings and corrected outcomes are evaluation and promotion
  evidence only. Production reviewer definitions MUST NOT include historical
  finding examples, PR-specific diagnoses, expected categories, or corrected
  patches.

### Learning-promotion contract

- Promotion recurrence is keyed on canonical category identity, not raw
  wording. `ChangeRiskCategory` is a closed, versioned identifier set in the
  shared policy source, with an explicit alias/normalization rule mapping
  variant labels onto one canonical identifier before recurrence is counted.
- A first systemic P1 safety/contract failure immediately adds a
  regression test and a scoped review rule where practical.
- A first validated non-systemic P1 follows the record-and-categorize path:
  it is recorded and categorized like a first ordinary P2/P3, and a
  regression test is added where practical. Its recorded category feeds the
  same second- and third-occurrence thresholds.
- A first ordinary P2/P3 is recorded and categorized.
- A second validated occurrence of the same canonical category adds a scoped
  `## Code Review Rules` rule plus a reviewer regression case.
- A third validated occurrence means the prompt/rule is insufficient and adds
  a test, lint, validator, or shared helper where practical.
- Promoted rules MUST be concise, consequential, scoped to the narrowest
  applicable path, and include the unsafe condition and safe path or
  counterexample.
- Promotion MUST NOT silently modify compiler-generated instruction regions.
  It writes only to a human-owned manual/scoped rule surface or produces a
  proposed patch requiring the normal write boundary.

### Promoted-rule lifecycle

- Before adding a prose rule, determine whether the failure can be prevented
  by a schema, interface, type, test, validator, lint rule, ownership check,
  or shared helper.
- A mechanical or interface-level guard MAY be introduced before the third
  occurrence when it is clearly practical and proportionate.
- A prompt rule is added only when model judgement remains part of the safe
  decision.
- Every promoted rule records:
  - stable rule ID
  - source category
  - narrow scope
  - evidence record references
  - date introduced
  - mechanical guard, when one exists
  - lifecycle status: `active | superseded | retired`
- When a deterministic guard provides equivalent or stronger protection, the
  redundant prompt rule MUST be removed, retired, or reduced to navigation
  guidance.
- A retired rule MUST NOT continue to be rendered into generated context.

### External-review contract

- GitHub Codex or another external review provider is an independent
  comparison signal only.
- A validated external P1/P2 reopens the local loop when budget remains.
  Exhausted budget escalates to `NEEDS_HUMAN_REVIEW`.
- Absence, failure, or nondeterminism of an external provider cannot prevent
  the local workflow from running.
- Historical backfill uses sanitized checked-in fixtures by default. The
  workflow MUST request explicit user approval immediately before any live
  GitHub review-thread read; refusal or unavailable approval performs no
  network call and either continues from sufficient fixtures or stops with the
  missing evidence reported.

## Security Rules

- No source code, diff, transcript, or repository content is uploaded by this
  feature.
- No secrets, literal tokens, private endpoints, or hidden reasoning enter
  committed learning records.
- Reviewer prompts preserve existing hard denials and cannot broaden
  permissions.
- The reviewer is read-only and does not commit, push, resolve review threads,
  install dependencies, contact production, or mutate files.
- External review remains separately consented and is never invoked
  automatically by the local workflow.
- Learning records include the minimum evidence required to reproduce the
  finding; secret-like values are described by shape, not copied verbatim.

## Architecture Rescue Candidates

### R1: One typed review-policy content source

- Files/modules involved: `packages/compiler/src/compiler.ts`, workflow skill
  rendering, built-in reviewer definitions, and generated Codex/Claude
  fixtures.
- Current friction: reviewer priorities, statuses, retry limits, risk
  surfaces, and output rules would otherwise be duplicated across several
  long generated instruction bodies.
- Proposed interface: one immutable change-risk policy/content definition
  exposing explicit reviewer, orchestration, learning-record, promotion, and
  evaluation projections; each generated artifact renders only the projection
  it needs.
- Locality/leverage: a policy change has one source and deterministic target
  renderers instead of manually synchronized prose.
- Test improvement: unit tests can assert the closed policy values while
  goldens verify target rendering.
- Conflicts: no profile-schema change and no weakening of phase-24 workflow
  contracts.
- Dependency state: implement inside I1 before adding the new reviewer; do not
  create a separate file-layer-only ledger task.

## Acceptance Criteria

1. A qualifying subagent-driven profile emits a dedicated
   `change-risk-reviewer` for Codex and Claude and references it from every
   generated orchestration surface without dangling references. Its model and
   effort resolve through the existing `critical-reviewer` role for
   mapping-v2, mapping-v3, and exact per-client override profiles.
2. The reviewer prompt and golden fixtures enforce complete-and-lossless
   snapshot access, clean-room, unchanged-consumer, risk-domain, priority,
   evidence, fingerprint, read-only, and no-upload contracts. The typed
   `change-risk/v1` result envelope and its scope/`missingInputs`/disposition
   relationships make empty, malformed, mismatched, and `NEEDS_CONTEXT`
   output incapable of producing a clean result.
3. The generated workflow encodes the exact three-fix-round, six-logical-
   invocation, two-transient-retry, budget-reservation, non-progress,
   terminal-precedence, confirmation, and human-escalation rules without
   conflicting counts or statuses, with `subagent-driven-change` as the sole
   owner of the state machine.
4. P1/P2 always block and omit disposition; P3 always receives one allowed
   disposition; every finding has one closed resolution; any code change
   invalidates a prior clean result.
5. A `review-learning/v1` template and workflow instructions produce a
   normalized committed record with all required version/date/snapshot,
   attempt, finding, conditional-disposition, and terminal-status fields while
   excluding raw transcripts. The workflow-policy version is
   `change-risk/v1` and advances only under the versioning rule above.
6. Promotion instructions implement the approved first/second/third
   occurrence policy and preserve generated/manual instruction ownership.
7. PRs #125 and #127-#133 are backfilled in a separate slice. The normalized
   corpus reconciles to 126 findings: 23 P1 and 103 P2, with source date and
   any later state drift disclosed.
8. A provider-neutral external-review rule reopens validated blockers without
   making network access or GitHub mandatory. Historical backfill uses
   checked-in fixtures by default and requires explicit approval before a live
   GitHub read.
9. Forward evaluation uses fresh reviewers and raw change artifacts without
   leaking the expected findings. Every seeded P1 category is recovered in at
   least one of two allowed clean-room evaluation runs; misses and variability
   are recorded rather than hidden.
10. Existing profiles without the qualifying workflow remain byte-identical
    except for deliberately shared guidance; generated files remain
    deterministic and lockfile tracked.
11. Full compiler/core tests, affected golden tests, check, doctor, and packed
    release verification run before the phase is reported complete, with
    unrelated local drift separated from regressions.
12. Each generated artifact contains only its authoritative policy
    projection; projection tests prove both required inclusion and forbidden
    unrelated content, and no closed count or transition rule is
    independently reproduced in two generated skill bodies.
13. Initial and final clean-room reviewer context contains no historical
    finding lists, recurrence counts, expected categories, or historical
    finding examples; a context-ablation evaluation shows the projection-based
    prompts preserve the required seeded-P1 recovery threshold.

## Tests

- Core/unit tests for `change-risk/v1`: priorities, conditional dispositions,
  resolutions, result-envelope statuses, scope/`missingInputs` relationships,
  fingerprint normalization, canonical category identity and aliasing,
  terminal statuses and precedence, risk-domain identifiers, retry counts,
  budget reservation, and confirmation triggers.
- Projection tests proving each generated artifact contains its required
  projection content and excludes forbidden unrelated policy sections, and
  failing when two surfaces independently define the same retry, round,
  confirmation, or escalation value.
- Model-policy tests proving `change-risk-reviewer` resolves through
  `critical-reviewer` for mapping-v2, mapping-v3, target-native effort, and
  exact per-client overrides.
- Skill-selection tests for conditional reviewer emission and no dangling
  references across pack/client combinations.
- Codex and Claude golden fixtures for the reviewer definition and every
  changed orchestration skill.
- Negative golden cases for profiles that do not qualify for the subagent
  chain.
- Content-contract tests proving initial/final clean-room prompts omit prior
  findings and remediation prompts require both closure verification and a
  fresh complete-snapshot search.
- Result-envelope tests for explicit clean, findings found, needs context,
  empty/truncated output, invalid status, policy/snapshot mismatch, and
  exhausted invalid-attempt retries.
- Table-driven state-machine tests for clean on initial review, dispositioned
  P3-only terminal clean, one-to-three fix rounds, same-fingerprint
  recurrence, unchanged remediation snapshots, required confirmation on an
  unchanged final snapshot, confirmation-discovers-blockers budget
  reservation, overlapping terminal-trigger precedence, blocker-count
  stagnation, attempt-retry exhaustion, code change after clean, and validated
  external blockers.
- Record-schema fixtures for all terminal statuses and every P3 disposition,
  including unknown reviewer versions and secret-shaped evidence redaction.
- Promotion fixtures for first systemic P1, first ordinary P2/P3, second
  occurrence, third occurrence, and generated-region refusal.
- Historical corpus reconciliation tests for per-PR and total priority counts.
- Local forward evaluation using fresh reviewers, raw historical diffs, and
  no expected-answer leakage.
- Context-ablation evaluation comparing the projection-based reviewer and
  orchestration prompts against the pre-simplification candidate on the same
  blinded cases, recording footprint, recovery, false positives,
  `NEEDS_CONTEXT` rate, malformed-result rate, and run variability for Codex
  and Claude independently.
- Packed published-journey assertion that emitted reviewer and orchestration
  artifacts are present, internally consistent, and source-free.

## TDD Strategy

I1-I4 and I6 are deterministic-generator/orchestration-policy slices. Their
highest fast seam is `compile(profile) -> emitted reviewer and skill
artifacts`, supported by pure policy/state-machine return values; no internal
renderer is mocked.

I5 is a deterministic transformation slice. Its default seam is
`sanitized checked-in review-thread fixture -> normalized review-learning
Markdown`; a live GitHub read is an explicitly approved unmanaged input, never
the default.

One slice owns one primary observable result and begins with a focused failing
unit, contract, golden, corpus, or published-journey assertion.

## Issue Plan

See `docs/specs/phase-33/issues/`:

- I1 emits the independent reviewer and establishes the shared policy source.
- I2 integrates bounded remediation and escalation.
- I3 defines and emits review-learning record behavior.
- I4 promotes recurring findings into scoped rules and mechanical guards.
- I5 backfills the approved historical PR corpus.
- I6 verifies the packed integrated workflow and fresh-reviewer evaluation.

Dependency map:

`I1 -> I2`; `I1 -> I3`; `I1 + I3 -> I4`; `I3 -> I5`;
`I1 + I2 + I3 + I4 + I5 -> I6`.
I3 is sequenced after I1 because I1 owns the shared policy source whose
closed values (`change-risk/v1`, statuses, dispositions, categories) I3's
record schema and learning-record projection must consume rather than
duplicate. I5 is parallel-safe with I2 and I4 once I3 lands. I6 is the final
integration slice and requires I5's accepted backfill evidence.

## Documentation Updates

- Phase-33 README and issue briefs.
- `CONTEXT.md` review-assurance glossary.
- ADRs 0022-0025.
- Generated workflow documentation and capability notes when they enumerate
  reviewer roles.
- `docs/review-learning/` schema/template documentation in I3.
- Historical normalized records and category summary in I5.

## Final Review Checklist

- Build a spec-to-test matrix for every MUST, acceptance criterion, status,
  retry limit, disposition, and error/escalation contract.
- Verify the complete-snapshot contract includes uncommitted staged,
  unstaged, and relevant untracked files without requiring a commit or staging
  mutation, and that a deterministic worktree snapshot identifier is present
  whenever uncommitted content participates.
- Verify each generated artifact carries only its authoritative projection
  and that no closed count or transition value is duplicated across surfaces.
- Verify initial/final clean-room context excludes historical records,
  recurrence counts, and historical finding examples.
- Verify every emitted reviewer and record carries `change-risk/v1`, and the
  reviewer resolves model policy through `critical-reviewer`.
- Reject every incomplete or invalid result envelope; only explicit valid
  `CLEAN` may produce a clean review state.
- Confirm initial/final clean-room inputs do not leak prior findings or
  implementer conclusions.
- Confirm remediation reviews search the whole updated change, not only the
  last patch.
- Verify all P1/P2 paths block and all P3 paths carry one disposition.
- Exercise all retry, non-progress, confirmation, and escalation transitions.
- Review every generated/manual ownership boundary.
- Confirm raw transcripts and secret-like values cannot enter committed
  learning records.
- Confirm historical backfill performs no live GitHub read without explicit
  user approval.
- Reconcile the historical corpus counts and disclose source-date drift.
- Run fresh-reviewer forward evaluation without expected-answer leakage.
- Run affected unit/golden tests, full tests, check, doctor, and
  `verify:pack`; separate pre-existing local drift from task regressions.
