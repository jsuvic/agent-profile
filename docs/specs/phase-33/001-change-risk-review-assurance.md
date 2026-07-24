# Spec: Change-Risk Review Assurance and Learning

## Status

Approved on 2026-07-24. Synthesized from the approved change-risk review
grill agreement of the same date.

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
reviews the complete change snapshot, applies a bounded remediation policy,
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
   repository review rules, and the complete change snapshot.
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
  staged and unstaged patches as one identified change snapshot; no commit is
  required solely for review.
- Base and head commit identifiers and an optional worktree snapshot
  identifier.
- Prior finding fingerprints for remediation reviews only.
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

### Reviewer contract

- The pipeline order is:
  `implementer -> spec-reviewer -> code-quality-reviewer ->
change-risk-reviewer -> final-review`.
- The change-risk reviewer is review-only and MUST NOT edit the change.
- The initial review MUST use a fresh reviewer and the complete change
  snapshot. It MUST NOT receive the implementer report, prior praise, or a
  prior finding list.
- Remediation reviews MUST inspect the complete updated snapshot, verify known
  fingerprints, and search independently for new findings.
- A final clean-room confirmation, when required, MUST use a fresh reviewer
  without a prior finding list.
- Review focus MUST include unchanged consumers and call paths, state
  transitions, ownership and write safety, compatibility and platform
  behavior, parsing and validation order, external network/process
  boundaries, generated-file ownership, published-package seams, runtime
  proof, redaction, and contract completeness.
- Findings MUST lead with `P1`, `P2`, or `P3`, cite concrete evidence and the
  affected contract or safe path, and carry a stable human-readable
  fingerprint that survives wording changes across rounds.

### Priority and disposition contract

- Every validated P1 and P2 blocks completion regardless of count.
- Every P3 is non-blocking but MUST use exactly one disposition:
  `fixed | accepted-debt | follow-up | false-positive | obsolete`.
- A false positive MUST include the evidence that invalidates it.
- Any code change invalidates the preceding clean result.

### Retry and escalation contract

- The initial review is not a fix round.
- At most three fix rounds may follow the initial review.
- At most five logical reviewer invocations may complete: the initial review,
  up to three remediation reviews, and one final clean-room confirmation.
- One logical reviewer invocation may retry a transient capacity/tool failure
  at most twice. Failed transient attempts are recorded separately and do not
  become review findings or fix rounds.
- The same unresolved fingerprint appearing twice without progress produces
  `NO_PROGRESS`.
- Failure to reduce the blocking-finding count across two consecutive
  remediation reviews produces `NO_PROGRESS`.
- Remaining P1/P2 findings after the third fix round produce
  `NEEDS_HUMAN_REVIEW`.
- Exhausted transient retries produce `NEEDS_HUMAN_REVIEW`; they MUST NOT be
  converted to a clean result.
- Review against an unchanged snapshot is not repeated.
- Final clean-room confirmation is required after any P1, after two or more
  fix rounds, or when the change touches permissions, secrets, atomic writes,
  release workflows, external network/process execution, generated
  ownership, or published packages.

### Review-learning record contract

- Committed normalized records live under `docs/review-learning/`, one file
  per PR/change.
- Raw prompts, transcripts, hidden reasoning, and unfiltered tool output MUST
  remain in a local ignored location and MUST NOT be committed.
- Schema version `review-learning/v1` requires: date, product version when
  known, workflow-policy version, base/head identifiers, optional worktree
  snapshot identifier, reviewer surface/version when known, logical
  invocation and transient-attempt counts, round outcomes, stable finding
  fingerprints, category, priority, evidence, affected contract, safe path,
  resolution, disposition, and terminal status.
- Terminal status is one of:
  `clean | blockers-open | no-progress | needs-human-review`.
- Unknown provider or model versions are recorded as `unknown`, never guessed.

### Learning-promotion contract

- A first validated P1 or systemic safety/contract failure immediately adds a
  regression test and a scoped review rule where practical.
- A first ordinary P2/P3 is recorded and categorized.
- A second validated occurrence of the same category adds a scoped
  `## Code Review Rules` rule plus a reviewer regression case.
- A third validated occurrence means the prompt/rule is insufficient and adds
  a test, lint, validator, or shared helper where practical.
- Promoted rules MUST be concise, consequential, scoped to the narrowest
  applicable path, and include the unsafe condition and safe path or
  counterexample.
- Promotion MUST NOT silently modify compiler-generated instruction regions.
  It writes only to a human-owned manual/scoped rule surface or produces a
  proposed patch requiring the normal write boundary.

### External-review contract

- GitHub Codex or another external review provider is an independent
  comparison signal only.
- A validated external P1/P2 reopens the local loop when budget remains.
  Exhausted budget escalates to `NEEDS_HUMAN_REVIEW`.
- Absence, failure, or nondeterminism of an external provider cannot prevent
  the local workflow from running.

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
  rendered into the reviewer and orchestration skills.
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
   generated orchestration surface without dangling references.
2. The reviewer prompt and golden fixtures enforce complete-snapshot,
   clean-room, unchanged-consumer, risk-domain, priority, evidence,
   fingerprint, read-only, and no-upload contracts.
3. The generated workflow encodes the exact three-fix-round, five-logical-
   invocation, two-transient-retry, non-progress, confirmation, and
   human-escalation rules without conflicting counts or statuses.
4. P1/P2 always block; P3 always receives one allowed disposition; any code
   change invalidates a prior clean result.
5. A `review-learning/v1` template and workflow instructions produce a
   normalized committed record with all required version/date/snapshot,
   attempt, finding, disposition, and terminal-status fields while excluding
   raw transcripts.
6. Promotion instructions implement the approved first/second/third
   occurrence policy and preserve generated/manual instruction ownership.
7. PRs #125 and #127-#133 are backfilled in a separate slice. The normalized
   corpus reconciles to 126 findings: 23 P1 and 103 P2, with source date and
   any later state drift disclosed.
8. A provider-neutral external-review rule reopens validated blockers without
   making network access or GitHub mandatory.
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

## Tests

- Core/unit tests for the immutable review policy: priorities, dispositions,
  terminal statuses, risk surfaces, retry counts, and confirmation triggers.
- Skill-selection tests for conditional reviewer emission and no dangling
  references across pack/client combinations.
- Codex and Claude golden fixtures for the reviewer definition and every
  changed orchestration skill.
- Negative golden cases for profiles that do not qualify for the subagent
  chain.
- Content-contract tests proving initial/final clean-room prompts omit prior
  findings and remediation prompts require both closure verification and a
  fresh complete-snapshot search.
- Table-driven state-machine tests for clean on initial review, one-to-three
  fix rounds, same-fingerprint recurrence, unchanged snapshot, blocker-count
  stagnation, transient retry exhaustion, required confirmation, code change
  after clean, and validated external blockers.
- Record-schema fixtures for all terminal statuses and every P3 disposition,
  including unknown reviewer versions and secret-shaped evidence redaction.
- Promotion fixtures for first systemic P1, first ordinary P2/P3, second
  occurrence, third occurrence, and generated-region refusal.
- Historical corpus reconciliation tests for per-PR and total priority counts.
- Local forward evaluation using fresh reviewers, raw historical diffs, and
  no expected-answer leakage.
- Packed published-journey assertion that emitted reviewer and orchestration
  artifacts are present, internally consistent, and source-free.

## TDD Strategy

I1-I4 and I6 are deterministic-generator/orchestration-policy slices. Their
highest fast seam is `compile(profile) -> emitted reviewer and skill
artifacts`, supported by pure policy/state-machine return values; no internal
renderer is mocked.

I5 is a deterministic transformation slice. Its seam is
`validated review-thread snapshot -> normalized review-learning Markdown`;
only the external GitHub read boundary may be replaced by checked-in fixtures.

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

`I1 -> I2`; `I1 + I3 -> I4`; `I3 -> I5`; `I1 + I2 + I3 + I4 -> I6`.
I1 and I3 are parallel-safe. I5 is parallel-safe with I2 and I4 once I3
lands. I6 is the final integration slice and does not require I5 to finish.

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
- Verify the complete-snapshot contract includes uncommitted staged/unstaged
  changes without requiring an agent commit.
- Confirm initial/final clean-room inputs do not leak prior findings or
  implementer conclusions.
- Confirm remediation reviews search the whole updated change, not only the
  last patch.
- Verify all P1/P2 paths block and all P3 paths carry one disposition.
- Exercise all retry, non-progress, confirmation, and escalation transitions.
- Review every generated/manual ownership boundary.
- Confirm raw transcripts and secret-like values cannot enter committed
  learning records.
- Reconcile the historical corpus counts and disclose source-date drift.
- Run fresh-reviewer forward evaluation without expected-answer leakage.
- Run affected unit/golden tests, full tests, check, doctor, and
  `verify:pack`; separate pre-existing local drift from task regressions.
