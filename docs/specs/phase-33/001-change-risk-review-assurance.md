# Spec: Change-Risk Review Assurance and Learning

## Status

Approved on 2026-07-24. Synthesized from the approved change-risk review
grill agreement of the same date.

Amended on 2026-07-27, before any I1 implementation, to add context
composition and ownership, snapshot disclosure, a typed reviewer interface,
single orchestration ownership, learning-record context isolation,
promoted-rule lifecycle, and context-ablation evaluation contracts, and to
close the open review findings on PR #134. At that time no `change-risk/v1`
artifact had been implemented or released, so the workflow-policy version
remained `change-risk/v1`.

Amended on 2026-07-30 for the version increment only. Phase 33's first
reviewer and orchestration artifacts were generated on PR #140, so ADR 0027's
pre-emission exception no longer applied to the subsequent fingerprint
encoding repair. Every contract below now names `change-risk/v2`; the
category taxonomy (`change-risk-categories/v1`) and the learning-record schema
(`review-learning/v1`) remain independently versioned and unchanged.

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
  staged and unstaged patches and untracked files as one change snapshot; no
  commit or staging mutation is required solely for review. The untracked
  rule is closed and auditable: every untracked file not excluded by the
  repository's committed ignore rules enters the snapshot by default, and
  any additional exclusion is listed in the manifest with its path and a
  concise reason so the reviewer can verify — "relevant" is never an
  unstated judgement call that hides a file.
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

- The initial workflow-policy version was `change-risk/v1`. The current
  workflow-policy version is `change-risk/v2`, incremented on 2026-07-30 under
  the rule below once the first artifact had been emitted (ADR 0027).
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
- The evaluation projection contains only:
  - blinded case-selection rules
  - measured-metric definitions (recovery, false positives, `NEEDS_CONTEXT`
    rate, malformed-result rate, invocation counts, context footprint)
  - run-count limits and required recovery thresholds
  - the identity of the pinned ablation-baseline fixture
  Its only consumer is the I6 evaluation harness.
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
- The owner communicates through one closed snapshot-bound handoff record,
  `ChangeRiskOrchestrationStateV1`, carrying: `policyVersion`, the reviewed
  `snapshotId`, the current or terminal status, logical-invocation,
  fix-round, and transient-attempt counters, the required/satisfied
  confirmation state, and the progress history the non-progress guards
  need: per-completed-round blocker counts and unresolved fingerprint
  checkpoints (inline or via a closed durable-state reference). A resumed
  owner enforces same-fingerprint recurrence and stagnation from that
  carried history and never resets it. `implement-next` and `final-review`
  validate that record — rejecting a terminal result whose `snapshotId` does
  not match the current snapshot (modulo the excluded review-metadata paths)
  — and never interpret free-form prose state or reset consumed budgets.
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
  the shared policy source. The exact initial identifiers are:
  `unchanged-consumers | state-transitions | ownership-write-safety |
  compatibility-platform | parsing-validation-order |
  network-process-boundaries | generated-ownership | published-seams |
  runtime-proof | redaction | contract-completeness`. Envelope validation
  accepts exactly these strings; adding or renaming one advances the
  workflow-policy version.
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
type EvidenceReference = {
  kind: "file" | "diff-hunk" | "symbol" | "test" | "contract"
    | "command-output";
  path?: string;
  symbol?: string;
  lines?: { start: number; end: number };
  commit?: string;
  summary: string;
  invalidatesPriorFinding?: true;
};

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
  source?: "local" | "external";
  provider?: string;
  systemic?: boolean;
  systemicReason?: string;
  disposition?:
    | "fixed"
    | "accepted-debt"
    | "follow-up"
    | "false-positive"
    | "obsolete";
  fingerprint: string;
};

type ChangeRiskResultV1 = {
  policyVersion: "change-risk/v2";
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

- The envelope is untrusted input, so closed size limits (finding count,
  evidence references per finding, `missingInputs` count, scope-domain count,
  and the length of any single string) are enforced at the validation boundary
  before anything traverses or normalizes the contents. An envelope exceeding
  them is an invalid attempt like any other malformed result. The limits are
  set far above any actionable review: a round carrying more findings than the
  bound could not be remediated inside the closed fix-round budget anyway.
- `source` defaults to `local` when absent. `provider` is required (using
  `unknown` when unidentifiable) when `source` is `external` and MUST be
  absent otherwise. A reviewer invocation itself only emits `local`
  findings; `external` is set solely by the orchestration owner's external
  validation handoff.
- `systemic` and `systemicReason` are set together by the orchestration
  owner when it validates a P1, per the promotion contract's closed
  predicate; both MUST be present on every validated P1 in the persisted
  record and absent on P2/P3 findings. Reviewer invocations do not emit
  them.
- Every finding carries at least one `EvidenceReference`. The `summary`
  describes secret-shaped values by shape only and MUST NOT reproduce
  secrets, raw transcripts, or source beyond the minimum needed to locate
  the defect.
- A `false-positive` closure requires at least one evidence reference with
  `invalidatesPriorFinding: true`; that reference's summary explains how the
  located evidence invalidates the prior unsafe condition. The marker MUST be
  absent for `open`, `fixed`, and `obsolete` findings.
- `EvidenceReference` is discriminated by `kind` with per-kind required
  locators: `file` requires `path`; `diff-hunk` requires `path` and `lines`;
  `symbol` requires `path` and `symbol`; `test` requires `path`; `contract`
  requires the contract name or document path in `path`; `command-output`
  requires the executed command in `summary` alongside the observation.
  `lines` requires `1 <= start <= end`. A reference missing its per-kind
  locator or with invalid bounds is malformed and makes the envelope
  invalid.
- `missingInputs` MUST be empty except for `NEEDS_CONTEXT`.
- `scope.completed` MUST be `true` only for `CLEAN` or a completed
  findings result.
- Every completed result (`CLEAN` or completed `FINDINGS_FOUND`) requires
  `inspectedChangeManifest: true` and `inspectedRelevantConsumers: true`. A
  completed status with either boolean `false` is an invalid attempt — a
  review that skipped unchanged-consumer inspection can never self-approve.
- A domain entry with `applicability: "not-applicable"` requires a
  non-empty `reason`; `reason` MUST be absent for applicable domains. A
  missing or empty inapplicability reason makes the envelope invalid, and a
  negative fixture covers it.
- `FINDINGS_FOUND` is valid only with `scope.completed: true` and full
  manifest/domain coverage. An envelope whose scope is incomplete and whose
  status is anything other than `NEEDS_CONTEXT` is an invalid attempt, never
  a partial review.
- P1/P2 findings MUST reject `disposition`; P3 findings MUST carry one valid
  `disposition`.
- A newly discovered finding is always `resolution: open`. An invocation may
  emit `fixed`, `false-positive`, or `obsolete` only for a finding whose
  fingerprint matches a prior-round finding supplied for closure
  verification; because initial and final clean-room reviews receive no
  prior finding list, every finding they emit MUST be `open`, and a
  non-`open` resolution without a matching supplied fingerprint makes the
  envelope invalid. A reviewer can never close its own newly discovered
  blocker.
- `CLEAN` is valid only for the requested snapshot with an empty findings
  array and an explicit completed-scope confirmation covering the complete
  manifest and every domain's applicability. `FINDINGS_FOUND` requires at
  least one structurally valid finding. `NEEDS_CONTEXT` requires a non-empty
  `missingInputs` list and is not a completed review.
- The reviewer's turn budget is one of the constraints that triggers
  `NEEDS_CONTEXT`, exactly like unavailable proof. A reviewer whose remaining
  budget cannot cover the checks still outstanding MUST stop inspecting and
  emit the envelope: it MUST reserve enough budget to do so, because a
  `NEEDS_CONTEXT` envelope naming what went unverified always beats emitting
  nothing, which the orchestration can only classify as an invalid attempt. An
  envelope degraded this way carries `scope.completed: false`, leaves unreached
  domains unmarked or reports them honestly, and names the specific checks not
  performed in `missingInputs` rather than a generic shortage of room. This is
  an ordinary `NEEDS_CONTEXT` result and requires no special case in the
  validator; it does not reclassify a missing envelope, which remains an
  invalid attempt.
- Every envelope value the validator requires to be a record rather than a
  scalar MUST have its exact keys stated in the emitted reviewer prompt, in the
  same way `scope` (`completed`, `inspectedChangeManifest`,
  `inspectedRelevantConsumers`, `domains`) and each `scope.domains[]` entry
  (`domain`, `applicability`, optional `reason`) already are. That set is
  `scope`, `scope.domains[]`, each `findings[]` entry, `findings[].location`
  (`path`, optional `symbol`, optional `line`), each
  `findings[].evidence[]` entry, and `findings[].evidence[].lines`
  (`start`, `end`). The set is derived from the validator's own behavior by a
  mechanical guard, so a newly *required* structured field cannot reach the
  prompt unstated. The guard derives the set by scalar-substituting each
  record-valued path of canonical envelopes, so it sees only fields those
  envelopes carry: a newly *optional* record-valued field is outside it and
  MUST still be projected by hand.
- Empty, truncated, unparseable, version/snapshot-mismatched, internally
  inconsistent, or otherwise malformed output is an invalid attempt, never a
  clean review.
- The fingerprint is derived from structured components —
  `category + affected contract + normalized location + unsafe-condition
  class` — where practical. The reviewer may supply those components; shared
  deterministic code normalizes the final fingerprint so it survives wording
  changes across rounds.

### Priority and disposition contract

- Every validated P1 and P2 with `resolution: open` blocks completion
  regardless of count. A P1/P2 whose closure a later review verifies —
  `fixed`, `obsolete`, or `false-positive` with invalidating evidence — no
  longer blocks; blocking is defined by `resolution`, never by the finding's
  historical existence.
- Every P3 is non-blocking but MUST use exactly one disposition:
  `fixed | accepted-debt | follow-up | false-positive | obsolete`.
- Every finding MUST use exactly one resolution:
  `open | fixed | false-positive | obsolete`.
- `disposition` is required for P3 and MUST be absent for P1/P2. A P3
  disposition of `fixed`, `false-positive`, or `obsolete` uses the matching
  resolution; `accepted-debt` and `follow-up` remain `open`.
- A false positive MUST include the evidence that invalidates it.
- Any code change invalidates the preceding clean result, with one closed
  path exclusion: files under `docs/review-learning/` — the current change's
  learning record and any proposed-patch artifact under
  `docs/review-learning/proposals/` — are not part of the reviewed snapshot
  identity, do not invalidate a terminal result, and are written after that
  result exists. Promotion never edits a human-owned rule surface as part of
  the reviewed change: it emits a proposed-patch artifact into the excluded
  path, and applying that patch to `AGENTS.md` or another rule surface is a
  separate later change that is reviewed and invalidates as usual.
  `final-review` verifies the terminal result against the snapshot excluding
  exactly the `docs/review-learning/` path prefix; any other post-review
  edit invalidates as usual.

### Retry and escalation contract

- The initial review is not a fix round.
- At most three fix rounds may follow the initial review.
- At most six logical reviewer invocations may complete: the initial review,
  up to three remediation reviews, and up to two final clean-room
  confirmations. The second confirmation exists only for paths where a
  required final confirmation discovers blockers, remediation follows within
  the remaining fix-round budget, and the still-applicable trigger then
  requires a new confirmation; when either budget cannot accommodate that
  path, the reservation rule below escalates instead.
- A fix round may begin only when the remaining logical-invocation budget can
  accommodate its remediation review plus any final clean-room confirmation
  that would then be required. When it cannot, the workflow escalates to
  `NEEDS_HUMAN_REVIEW` instead of finishing without the required
  confirmation.
- One logical reviewer invocation may retry a transient capacity/tool failure,
  invalid result envelope, or `NEEDS_CONTEXT` result at most twice after the
  missing input is supplied. Failed or incomplete attempts are recorded
  separately and do not become review findings or fix rounds.
- When a `NEEDS_CONTEXT` missing input cannot be supplied — it is
  unavailable, or providing it is forbidden by the safety, permission, or
  no-upload contracts — the invocation escalates to `NEEDS_HUMAN_REVIEW`
  immediately with the unsatisfiable request recorded, instead of waiting on
  a supplied-context retry that can never occur.
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
- A completed `FINDINGS_FOUND` result containing no P1/P2 with
  `resolution: open` — every P1/P2 verified `fixed`, `obsolete`, or an
  evidenced `false-positive`, and every P3 carrying a valid disposition —
  contains no blocker. It reaches terminal `clean` exactly as a `CLEAN`
  result would — without relabeling the reviewer envelope and without an
  additional review of the unchanged snapshot — subject to the same
  required-confirmation triggers.
- Initial or remediation review against an unchanged snapshot is not
  repeated. A required final clean-room confirmation is the sole exception:
  it intentionally re-reviews the same final snapshot as an independent
  logical invocation.
- A fix round that leaves the reviewed snapshot unchanged while open
  blockers remain consumes no logical invocation and produces `NO_PROGRESS`
  immediately, unless a `NEEDS_HUMAN_REVIEW` trigger also applies, in which
  case the precedence rule below decides.
- Final clean-room confirmation is required after any P1, after two or more
  fix rounds, or when the change touches permissions, secrets, atomic writes,
  release workflows, external network/process execution, generated
  ownership, or published packages.
- High-risk classification is deterministic: the shared policy source
  defines the closed high-risk surface set as path/glob and contract-level
  predicates evaluated over the changed-file manifest, not semantic
  judgement. A documentation-only mention of a high-risk term does not
  qualify. Boundary fixtures MUST cover qualifying paths and their
  non-qualifying neighbors.

### Review-learning record contract

- Committed normalized records live under `docs/review-learning/`, one file
  per PR/change.
- Raw prompts, transcripts, hidden reasoning, and unfiltered tool output MUST
  remain in a local ignored location and MUST NOT be committed.
- The normalization-schema version (`review-learning/v1`) is separate from
  the policy that produced the review. Every record carries a closed
  `sourcePolicy` value: `change-risk/v2` for reviews executed by this
  workflow, or `legacy-external` for reviews that predate it or come from an
  external provider.
- Schema version `review-learning/v1` requires: date, product version when
  known, source policy, base/head identifiers, worktree snapshot identifier
  when uncommitted content participated, reviewer surface/version when known,
  round outcomes with per-round/per-finding source markers, stable finding
  fingerprints, category with its categorization taxonomy version, priority,
  the systemic classification and reason for validated P1s, evidence,
  affected contract, safe path, resolution, conditional P3 disposition with
  a closed owner-confirmation marker (`dispositionConfirmed: true | false`
  plus the owner's decision evidence for every open P3 — a reviewer-proposed
  disposition records `false` until the owner confirms it), and terminal
  status.
- Logical-invocation and transient-attempt counts are required only for
  `sourcePolicy: change-risk/v2` records. `legacy-external` records omit
  them instead of fabricating provenance.
- Record-level `sourcePolicy` names the orchestration that produced the
  record. Within a `change-risk/v2` record, every round and finding carries
  a closed `source: local | external` marker: local rounds keep their
  required execution counters, while findings a validated external review
  contributed carry `source: external` with the provider recorded (or
  `unknown`) and no fabricated local execution data. A record never
  collapses mixed local and external provenance into one value.
- Terminal status is one of `clean | no-progress | needs-human-review` for
  `sourcePolicy: change-risk/v2` records. `legacy-external` records use the
  closed status `external-only` instead — they never executed the local
  state machine, and a local terminal status is never guessed from thread
  state.
- The record `date` is a UTC ISO 8601 calendar date, exactly `YYYY-MM-DD`;
  timestamps, offsets, and locale-dependent forms are malformed.
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
  wording. `ChangeRiskCategory` is a closed identifier set in the shared
  policy source under taxonomy version `change-risk-categories/v1`, with an
  explicit alias table mapping variant labels onto one canonical identifier
  before recurrence is counted. Exact canonical identifiers take precedence
  over aliases; a label matching neither maps to `uncategorized`, which is
  excluded from promotion counting until a human assigns a canonical
  category. The exact `change-risk-categories/v1` identifiers are:
  `cross-consumer-integration | preview-before-write-ordering |
  ownership-atomicity | network-process-boundary | parser-version-contract |
  published-package-seam | runtime-proof | state-classification |
  secret-output`. The v1 alias table starts empty; normalization maps a
  variant label onto a canonical identifier only through an explicit table
  entry, never by fuzzy matching. Adding, renaming, or re-aliasing identifiers
  advances the taxonomy version with a migration rule for existing records;
  every record carries the taxonomy version used to categorize it.
- The occurrence unit is one reviewed change: repeated rounds, repeated
  fingerprints, and unresolved recurrences within the same change
  deduplicate to at most one occurrence per canonical category. Recurrence
  thresholds count distinct reviewed changes with at least one validated
  finding in that category.
- A local finding is validated by the recorded closure evidence, not by
  reviewer assertion alone: promotion counts only findings whose recorded
  terminal resolution is `fixed`, or `open` where the persisted record
  carries `dispositionConfirmed: true` — the orchestration owner, not the
  reviewer, confirmed the `accepted-debt` or `follow-up` decision with its
  supporting evidence. A reviewer-proposed disposition with
  `dispositionConfirmed: false` does not count. Findings resolved
  `false-positive` (with invalidating evidence) or `obsolete` are excluded
  from recurrence counting. The orchestration owner records resolutions,
  confirmed dispositions, and their evidence in the learning record;
  promotion logic reads the persisted values and never re-adjudicates
  prose.
- A validated P1 is classified `systemic` by a closed predicate: its
  affected contract is a hard safety, permission, ownership, redaction, or
  no-upload contract, or its unsafe condition demonstrably reaches two or
  more independent consumers or surfaces beyond the single reviewed path.
  The classification is persisted on the validated finding as a required
  `systemic: true | false` field with a one-line reason; when the predicate
  is uncertain, the finding is non-systemic and the reason says why.
- A first systemic P1 safety/contract failure immediately adds a
  regression test and a scoped review rule where practical.
- A first validated non-systemic P1 follows the record-and-categorize path:
  it is recorded and categorized like a first ordinary P2/P3, and a
  regression test is added where practical. Its recorded category feeds the
  same second- and third-occurrence thresholds.
- A first ordinary P2/P3 is recorded and categorized.
- A second validated occurrence of the same canonical category adds a
  reviewer regression case, plus a scoped `## Code Review Rules` rule unless
  an existing mechanical guard already provides equivalent or stronger
  protection — in that case the prompt rule is omitted (or reduced to
  navigation guidance) and the promotion record cites the guard instead.
- A third validated occurrence means the prompt/rule is insufficient and adds
  a test, lint, validator, or shared helper where practical.
- Promoted rules MUST be concise, consequential, scoped to the narrowest
  applicable path, and include the unsafe condition and safe path or
  counterexample.
- Promotion MUST NOT silently modify compiler-generated instruction regions,
  and within the reviewed change it writes only proposed-patch artifacts
  under `docs/review-learning/proposals/` (the excluded metadata path).
  Applying a proposal to a human-owned manual/scoped rule surface is a
  separate later change through the normal write boundary and review.

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
- External findings enter the loop only through a closed validation handoff
  owned by the orchestration owner (`subagent-driven-change`): the owner
  reproduces the reported unsafe condition from local evidence against the
  current snapshot and either normalizes it into a `ChangeRiskFindingV1`
  with `source: external`, or records it as `false-positive` with the
  invalidating evidence or `obsolete` with the superseding change. The
  validation decision and its evidence persist in the learning record;
  external output is never trusted automatically and never silently
  discarded.
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
   `change-risk/v2` result envelope and its scope/`missingInputs`/disposition
   relationships make empty, malformed, mismatched, and `NEEDS_CONTEXT`
   output incapable of producing a clean result.
3. The generated workflow encodes the exact three-fix-round, six-logical-
   invocation, two-transient-retry, budget-reservation, non-progress,
   terminal-precedence, confirmation, and human-escalation rules without
   conflicting counts or statuses, with `subagent-driven-change` as the sole
   owner of the state machine.
4. P1/P2 findings with `resolution: open` always block and omit disposition,
   and verified-closed P1/P2 findings stop blocking; P3 always receives one
   allowed disposition; every finding has one closed resolution; any code
   change outside the excluded review-metadata paths invalidates a prior
   clean result.
5. A `review-learning/v1` template and workflow instructions produce a
   normalized committed record with all required version/date/snapshot,
   attempt, finding, conditional-disposition, and terminal-status fields while
   excluding raw transcripts. The workflow-policy version is
   `change-risk/v2` and advances only under the versioning rule above.
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

- Core/unit tests for `change-risk/v2`: priorities, conditional dispositions,
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
- Table-driven state-machine tests for clean on initial review,
  no-open-blocker terminal clean (verified-closed P1/P2 and dispositioned
  P3-only variants), one-to-three fix rounds, same-fingerprint
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
  orchestration prompts against the pinned pre-simplification baseline
  fixture on the same blinded cases, recording footprint, recovery, false
  positives, `NEEDS_CONTEXT` rate, malformed-result rate, and run
  variability for Codex and Claude independently. The baseline is a
  versioned, checked-in evaluation fixture rendered by I1 from the complete
  un-projected policy — never a shipped artifact and never reconstructed
  ad hoc by the evaluator.
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
closed values (`change-risk/v2`, statuses, dispositions, categories) I3's
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
- Verify every emitted reviewer artifact and every workflow-produced record
  carries `change-risk/v2`, that `legacy-external` records satisfy their
  separate provenance rules instead, and that the reviewer resolves model
  policy through `critical-reviewer`.
- Reject every incomplete or invalid result envelope; only an explicit valid
  `CLEAN`, or a completed `FINDINGS_FOUND` with no open P1/P2 and fully
  dispositioned P3s, may produce a clean review state.
- Confirm initial/final clean-room inputs do not leak prior findings or
  implementer conclusions.
- Confirm remediation reviews search the whole updated change, not only the
  last patch.
- Verify all open-resolution P1/P2 paths block, verified-closed P1/P2
  findings stop blocking, and all P3 paths carry one disposition.
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
