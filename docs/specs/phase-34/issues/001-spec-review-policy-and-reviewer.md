# I1: Define the spec-review policy and emit the reviewer

## Parent spec or request

`docs/specs/phase-34/001-bounded-spec-review.md`

## Intent summary

Give Codex and Claude a fresh-context reviewer whose only objective is to
find contract-level defects in a persisted spec set before implementation
starts.

## Behavior slice

Add a `spec-review/v1` projection to the shared review-policy source
established by phase-33 I1: the closed category set, priorities, disposition
values, budgets, stop rule, non-progress rules, and terminal statuses. Emit
a `spec-reviewer` definition for qualifying Codex and Claude profiles whose
prompt receives the agreement record and complete document manifest, applies
the closed categories, respects the agreement-record authority boundary, and
returns one valid typed `SpecReviewResultV1` envelope.

## Non-goals

- Orchestrating the loop or the ledger gate; I2 owns that behavior.
- New model-policy role IDs; resolution uses `critical-reviewer`.
- Changing phase-33 change-risk policy values.

## Acceptance criteria

- The policy source exposes a spec-review projection with focused unit
  tests; no closed value is duplicated in prose bodies.
- Qualifying outputs contain the reviewer with no dangling references;
  non-qualifying profiles remain byte-identical.
- The prompt enforces clean-room inputs, complete-manifest access, the
  agreement-record authority boundary, and open-only new findings.
- Envelope fixtures reject malformed, incomplete-scope, and self-closed
  results.
- Projection tests prove the spec reviewer receives no change-risk rubric,
  promotion, or historical content, and vice versa.

## Expected RED proof

A policy/unit test expecting the spec-review projection and reviewer
emission fails because neither exists.

## Expected GREEN proof

Projection tests and Codex/Claude goldens pass; negative fixtures remain
byte-identical.

## Seam under test

Deterministic generator: `compile(profile) -> emitted spec-reviewer
definition`, supported by the policy projection's public values.

## Allowed mock boundary

None.

## Likely file ownership

- Shared review-policy source from phase-33 I1
- `packages/compiler/src/compiler.ts` and skill-selection seams
- Codex/Claude expected fixtures and focused tests

## Dependencies

`sequenced` after phase-33 I1 and I3; consumes their policy-source pattern
and record schema.

## Contract impact

Adds one built-in reviewer artifact and one policy projection; no
`ai-profile.yaml` schema change.

## Security impact

Reviewer is read-only, local, secret-denied; no upload.

## Review expectations

Verify the reviewer challenges consistency and completeness without
relitigating agreement-record decisions, and that its categories cannot be
confused with change-risk categories.
