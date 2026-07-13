# ADR 0018: Grill Approval Authorizes Faithful Synthesis Persistence

## Status

Accepted 2026-07-13 with the phase-24/001 amendment.

## Context

The grill exists to resolve direction, scope, contracts, non-goals, and hard
trade-offs before planning. Requiring another approval after mechanically
deriving a spec and issue briefs repeats the same product decision and creates
a gap where approved work remains only in chat. Removing the gate entirely,
however, could allow unresolved or newly introduced decisions to be persisted.

## Decision

Human approval of a completed grill agreement automatically authorizes its
faithful `request-to-spec-issues` synthesis and one bounded local persistence
step. No second product-level approval is requested. Synthesis stops before
writes and asks the human only when it discovers a contradiction, a missing
material decision, or scope expansion. Client filesystem permission controls
remain authoritative. Implementation is never authorized by this approval.

## Rationale

Approval should attach to the decisions, not their document format. The three
derivation exceptions preserve a human gate exactly where a new decision is
actually required, while automatic persistence makes the approved state
durable and ready for implementation dispatch.

## Consequences

Positive:

- One meaningful approval replaces two repetitive approvals.
- Approved decisions are persisted immediately and are less likely to drift.
- The implementation ledger becomes ready without another manual command.

Negative:

- Grill approval now has a broader, clearly documented persistence effect.
- Synthesis must reliably classify derivation exceptions before writing.
- Generated skills and goldens must keep this boundary consistent.
