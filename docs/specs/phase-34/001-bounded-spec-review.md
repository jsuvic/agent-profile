# Spec: Bounded Pre-Implementation Spec Review

## Status

Draft 2026-07-27, pending grill approval. Motivated by the phase-33 spec
review on PR #134: nine external review rounds against the approved spec set
produced 71 validated findings, including 12 P1-class contract defects —
unreachable terminal states, a reviewer able to self-close its own blockers,
budget paths with no valid transition — all before any implementation
existed. The loop had no budget, no stop rule, and no residual-finding
disposition; convergence was judged manually, and one third of the final
rounds' findings were drift between the spec, its ADRs, and the task ledger
introduced by earlier amendment rounds.

## Problem

The grill workflow clarifies product intent, and synthesis persists the
derived spec set, but nothing reviews that spec set adversarially before the
first implementation slice is dispatched. Contract defects that are cheap to
fix in a document become expensive mid-implementation rework, and when an
external reviewer is applied ad hoc, the review loop is unbounded: each
amendment round can introduce new cross-document drift, findings shift from
contract defects to validator minutiae, and only a human noticing the trend
stops the churn.

## Goal

After grill approval and synthesis persistence, the generated workflow runs a
bounded clean-room review loop over the complete persisted spec set. The loop
fixes contract-level defects, dispositions residual detail findings
explicitly, terminates on a closed stop rule, and gates the first
implementation slice on its terminal result.

## Intent

Catch specification defects at the document stage where they are cheapest to
fix, using the same discipline phase 33 applies to implementation review:
fresh clean-room context, complete-input access, typed results, bounded
rounds, explicit escalation, and recorded learning. Keep the reviewer's
authority narrow: it challenges consistency, completeness, and testability;
it never relitigates product decisions the grill agreement made.

## Decision Rules

1. Authority doubt -> a conflict with the approved agreement record is a
   finding to report, never a decision to overturn.
2. Convergence doubt -> a round yielding zero open P1 findings terminates
   the loop; do not keep reviewing because more findings are imaginable.
3. Residual doubt -> a P2/P3 finding at loop end receives an explicit
   disposition; `defer-to-implementation` is a first-class recorded outcome,
   not a silent drop.
4. Drift doubt -> treat spec/ADR/ledger/glossary disagreement as a
   first-class finding category; one amendment fixes every copy.
5. Progress doubt -> the same unresolved fingerprint across two rounds, or a
   round with more open P1 findings than the previous round, escalates to
   the human instead of consuming another round.
6. Depth doubt -> when a finding asks for detail the implementation's typed
   policy source must own anyway, defer it with evidence rather than
   duplicating the value into prose.

## Non-Goals

- Reviewing implementation diffs; phase 33 owns change snapshots.
- Reopening, weakening, or re-deciding approved agreement-record decisions.
- Unlimited review rounds or reviewer-driven scope growth.
- A required external review provider, network access, or GitHub dependency.
- Blocking the loop on P2/P3 findings that have an explicit disposition.
- A new `ai-profile.yaml` option for this first change.
- Replacing the human's ability to stop, accept, or reopen at any point.

## User Flow

1. The user approves the grill agreement record; synthesis persists the spec
   set (spec, issue briefs, ledger entries, glossary terms, qualifying
   ADRs). The new implementation tasks persist as not yet dispatchable.
2. A fresh `spec-reviewer` receives the agreement record, the complete
   persisted document manifest, and the governing repository contracts. It
   returns a typed result over the closed spec-risk categories.
3. Validated P1 findings are fixed by amending the documents in one bounded
   amendment round; P2/P3 findings receive dispositions.
4. A fresh review of the complete amended document set verifies prior
   fingerprints and searches for new findings, including drift the
   amendments introduced.
5. The loop terminates on the first round with zero open P1 findings, or
   escalates to the human when budgets or progress rules trip.
6. The terminal result is recorded under `docs/review-learning/`, residual
   dispositions included, and the ledger gate opens the first implementation
   slice only on `approved-for-implementation`.

## Inputs

- The approved grill agreement record for the change.
- The complete persisted document manifest: spec, issue briefs, ledger
  section, glossary additions, and qualifying ADRs, plus the repository
  contracts and upstream specs they reference.
- Prior finding fingerprints for revision reviews only.
- The shared review machinery established by phase 33 I1/I3: typed envelope
  patterns, fingerprint normalization, learning-record schema, and the
  context-composition projection discipline.
- Existing provider-neutral `critical-reviewer` model-policy resolution.

## Outputs

- Generated Codex and Claude `spec-reviewer` definitions.
- Updated generated grill/synthesis workflow instructions that run the loop
  and gate implementation dispatch.
- One `review-learning/v1` record per reviewed spec set with
  `sourcePolicy: spec-review/v1`.
- Explicit `approved-for-implementation` or `needs-grill` outcomes.
- Golden fixtures and contract tests for the generated loop.

## Contracts

### Spec-review policy version contract

- The initial workflow-policy version is `spec-review/v1`.
- Reviewer envelopes, orchestration instructions, and learning records
  produced by this loop MUST emit that exact version. The phase-33
  versioning rule applies: contract changes increment it, editorial
  clarification does not.

### Reviewer contract

- The spec reviewer is review-only: it MUST NOT edit documents, and
  amendments are authored by the synthesis/author surface, never by the
  reviewer.
- The initial and every revision review use a fresh reviewer. Revision
  reviews receive only the fingerprints from the immediately preceding
  round; no review receives authoring rationale, prior praise, or the grill
  transcript.
- The reviewer receives complete and lossless access to the persisted
  document manifest under the phase-33 snapshot-disclosure pattern:
  manifest-first, with instructions and ability to read every document and
  any referenced upstream contract.
- The approved agreement record is ground truth for product decisions. A
  document that diverges from it is an `agreement-divergence` finding; a
  reviewer preference against an agreed decision is not a finding.
- The spec-risk categories are a closed identifier set:
  `spec-contradiction | unreachable-state | undefined-closed-value |
  missing-error-contract | doc-sync-drift | untestable-criterion |
  agreement-divergence`.
- The manifest identifier is deterministic over the exact byte set of the
  persisted documents in the manifest: different reviewed content can never
  share an identifier, and every terminal result binds to one.
- Results use a typed envelope mirroring the phase-33 shape
  (`SpecReviewResultV1`): `policyVersion`, the manifest identifier, exactly
  one status from `CLEAN | FINDINGS_FOUND | NEEDS_CONTEXT`, a completed-
  scope confirmation over the full manifest, findings with priority,
  category, document location, evidence, component-derived normalized
  fingerprint, and resolution. The phase-33 envelope validity rules apply:
  newly discovered findings are `open`, incomplete or malformed output is an
  invalid attempt, and `CLEAN`/completed results require full manifest
  coverage.
- Priorities: P1 is a defect that would make the spec unimplementable,
  self-contradictory, or unsafe to implement as written; P2 is a consequential
  gap with a safe default; P3 is minor. P1 blocks the loop from terminating;
  P2/P3 require dispositions only.

### Bounded loop contract

- The loop permits at most three logical reviews: the initial review and at
  most two revision reviews, each preceded by at most one amendment round.
- The phase-33 transient-retry rule applies per logical review: at most two
  retries for invalid envelopes or supplied-`NEEDS_CONTEXT`; unsatisfiable
  context requests escalate immediately.
- Stop rule: the first completed round with zero P1 findings at
  `resolution: open` terminates the loop as `approved-for-implementation`,
  after every residual P2/P3 receives one disposition from
  `fixed | defer-to-implementation | reject-with-evidence`.
- At a terminating round, `fixed` is valid only for a finding whose closure
  that round's review already verified. A residual finding cannot be
  dispositioned `fixed` by amending documents after the terminating review:
  any amendment to the manifest invalidates the terminal result and either
  consumes a remaining revision round on the amended manifest or terminates
  as `needs-grill` when no budget remains. The recorded approval is bound to
  the exact reviewed manifest identifier.
- `defer-to-implementation` requires naming the implementation artifact
  expected to close it (a typed policy value, validator, test, or fixture);
  the deferral is recorded in the learning record and is available to the
  affected slice's implementer and reviewers.
- Non-progress: the same unresolved P1 fingerprint across two consecutive
  rounds, or a revision round whose count of P1 findings at
  `resolution: open` exceeds the previous round's open-P1 count, terminates
  as `needs-grill`. Prior P1s a revision verifies closed are excluded from
  both sides of that comparison.
- Budget exhaustion with P1 findings still open terminates as `needs-grill`.
- The phase-33 transient-retry exhaustion rule maps to this loop's terminal
  set: exhausted retries terminate as `needs-grill`, never as a hang, an
  extra attempt, or a phase-33 status.
- `needs-grill` returns to the human, who resolves it through one of three
  closed paths; the loop never overrides that decision:
  - Reopen the grill or amend the agreement record: synthesis re-persists
    the document set and a new loop instance starts with a full budget,
    bound to the new manifest.
  - Explicitly accept specific findings: each accepted finding records the
    human decision as disposition `accepted-by-human` with its reason, and
    one fresh confirmation review runs against the current manifest. When
    that review reports zero open P1 findings excluding the human-accepted
    ones, the loop terminates `approved-for-implementation` bound to that
    manifest, superseding the `needs-grill` record; otherwise it returns to
    `needs-grill`.
  - Restart: when `needs-grill` was reached mechanically — retry exhaustion
    with no open findings — the human may restart a new loop instance with
    a full budget on the unchanged manifest. The first two paths apply to
    finding-bearing `needs-grill`; restart applies only to the mechanical
    case.
- The acceptance confirmation review is a distinct human-triggered
  invocation outside the three-review autonomous budget, limited to exactly
  one per recorded acceptance decision; a further cycle requires a new
  explicit human decision. The autonomous loop can never trigger it.
- Terminal status is one of `approved-for-implementation | needs-grill`, and
  the ledger keeps every implementation slice of the reviewed spec set
  non-dispatchable until `approved-for-implementation` is recorded.

### Ownership and reuse contract

- Exactly one generated surface owns the loop state machine: the synthesis
  workflow surface that persists the spec set and authors amendments. The
  grill skill hands off to it on approval, and implementation-dispatch
  surfaces only verify or propagate its terminal result; no other surface
  invokes the spec reviewer or redefines budgets and transitions.
- Amendments triggered by findings update every affected copy — spec, issue
  briefs, ledger, glossary, ADRs — in the same amendment round;
  `doc-sync-drift` findings against a prior amendment count toward the
  non-progress rule.
- The loop reuses phase-33 machinery rather than duplicating it: the shared
  policy-source pattern with a spec-review projection, the fingerprint
  normalization approach, and the `review-learning/v1` record schema with
  the following closed extensions valid only for
  `sourcePolicy: spec-review/v1` records:
  - terminal statuses `approved-for-implementation | needs-grill`;
  - the conditional disposition field applies to P2 and P3 findings (not
    only P3) with the closed set
    `fixed | defer-to-implementation | reject-with-evidence |
    accepted-by-human`, reusing the existing owner-confirmation marker and
    evidence shape;
  - a P1 finding may carry a disposition only on the human-acceptance path,
    and `accepted-by-human` is the only disposition valid on a P1; only the
    recorded human decision may set it. An accepted finding retains
    `resolution: open` — acceptance is a decision about the finding, not a
    claim that it was fixed — and findings with `accepted-by-human` are
    excluded from every open-P1 count;
  - the reviewed manifest identifier in place of base/head snapshot
    identifiers.
  Records from other source policies reject these extensions.
- The spec reviewer resolves model policy through the existing
  `critical-reviewer` role; no new role ID.
- The qualification predicate is closed: a profile qualifies exactly when it
  both emits the generated grill/synthesis workflow (the existing
  `workflow.sdd` gate) and qualifies for the phase-33 subagent-driven
  reviewer chain. SDD-only profiles without the subagent chain, and
  subagent profiles without the SDD workflow, remain byte-identical; the
  boundary tests cover both sides.
- Generated surfaces receive only their projection: the spec reviewer does
  not receive the change-risk rubric, promotion thresholds, or historical
  records, and the change-risk reviewer does not receive spec-review
  categories.

## Security Rules

- The loop is local: no document, transcript, or finding is uploaded.
- The reviewer is read-only and cannot edit documents, the agreement record,
  or the ledger.
- Learning records follow the phase-33 redaction rules; raw transcripts stay
  local and ignored.
- Reviewer prompts preserve existing hard denials and cannot broaden
  permissions.

## Acceptance Criteria

1. A qualifying profile emits `spec-reviewer` definitions for Codex and
   Claude, resolving model policy through `critical-reviewer`, with no
   dangling references and byte-identical output for non-qualifying
   profiles.
2. The generated grill/synthesis workflow runs the bounded loop after
   persistence: three-logical-review budget, one amendment round per
   revision, transient-retry rule with exhaustion mapping to `needs-grill`,
   zero-open-P1 stop rule with manifest binding, non-progress rules over
   open findings, both terminal statuses, and the three closed
   human-resolution paths with bounded confirmation accounting, with no
   conflicting counts.
3. The typed `SpecReviewResultV1` envelope enforces the closed categories,
   full-manifest completed scope, open-only new findings, and
   invalid-attempt handling; malformed output can never terminate the loop.
4. Residual P2/P3 findings at termination each carry one closed disposition;
   `defer-to-implementation` names its expected closing artifact and is
   surfaced to the affected slice.
5. Implementation slices of a reviewed spec set are non-dispatchable until
   `approved-for-implementation` is recorded; `needs-grill` returns open
   findings to the human without overriding agreement-record decisions.
6. One `review-learning/v1` record per reviewed spec set carries
   `sourcePolicy: spec-review/v1`, the round outcomes, dispositions, and
   terminal status, excluding raw transcripts.
7. Full compiler/core tests, affected golden tests, check, doctor, and
   packed verification run before the phase is reported complete.

## Tests

- Policy unit tests for `spec-review/v1` closed values: categories,
  priorities, dispositions, budgets, stop rule, non-progress rules, and
  terminal statuses.
- Envelope tests for valid clean, findings, needs-context, malformed,
  incomplete-scope, and self-closed-finding rejection.
- Table-driven loop tests: clean on initial review, one and two revision
  rounds, zero-open-P1 termination with residual dispositions, rejection of
  `fixed` for unverified closure at termination, post-termination amendment
  invalidation and rebinding, same-fingerprint non-progress, open-P1-count
  regression with verified-closed exclusion, budget exhaustion, retry
  exhaustion to `needs-grill`, unsatisfiable context, and all three
  human-resolution paths — including one-confirmation-per-acceptance
  accounting and the mechanical restart case.
- Golden fixtures for the reviewer definition and changed grill/synthesis
  skills on Codex and Claude; negative fixtures for non-qualifying profiles.
- Record fixtures for both terminal statuses and every disposition,
  including `defer-to-implementation` artifact naming, an accepted P1 with
  `accepted-by-human` and `resolution: open`, and rejection of any other
  P1 disposition.
- Manifest-identifier determinism tests: identical content yields the same
  identifier, any byte change yields a different one.
- Ledger-gate tests proving implementation slices stay non-dispatchable
  until the terminal record exists.

## TDD Strategy

All slices are deterministic-generator/policy slices. The highest fast seam
is `compile(profile) -> emitted spec-reviewer and workflow artifacts`,
supported by pure policy/loop-transition return values; no internal renderer
is mocked. Each slice begins with a focused failing unit, contract, or
golden assertion.

## Issue Plan

See `docs/specs/phase-34/issues/`:

- I1 defines the spec-review policy projection and emits the reviewer.
- I2 integrates the bounded loop and ledger gate into the generated
  grill/synthesis workflow.
- I3 validates the packed integrated loop and records phase evidence.

Dependency map: phase-33 I1 + I3 -> phase-34 I1; `I1 -> I2`; `I1 + I2 -> I3`.
Phase-34 I1 consumes the shared policy-source pattern and record schema that
phase-33 I1/I3 establish; it does not fork them.

## ADR Candidates

- Bounded pre-implementation spec review: one ADR recording the decision to
  gate implementation dispatch on a budgeted clean-room spec review with a
  zero-P1 stop rule and explicit residual dispositions, with the PR #134
  review history as evidence. Persisted on approval as the next ADR number.

## Documentation Updates

- Phase-34 README and issue briefs.
- `CONTEXT.md` glossary: spec-risk review, stop rule, residual disposition,
  `defer-to-implementation`.
- Generated workflow documentation where it describes the grill/synthesis
  flow.

## Final Review Checklist

- Build a spec-to-test matrix for every MUST, budget, stop rule,
  non-progress rule, disposition, and terminal status.
- Verify the reviewer cannot edit documents or overturn agreement-record
  decisions, and that `agreement-divergence` findings cite the record.
- Verify clean-room inputs exclude the grill transcript and authoring
  rationale, and revision reviews receive only prior fingerprints.
- Verify the ledger gate holds every slice of the reviewed set until the
  terminal record exists.
- Verify residual dispositions are recorded and `defer-to-implementation`
  reaches the affected slice.
- Confirm no upload, no transcript persistence, and no permission
  broadening.
- Run affected unit/golden tests, full tests, check, doctor, and
  `verify:pack`.
