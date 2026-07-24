# ADR 0023: Bounded Review Remediation and Escalation

## Status

Accepted 2026-07-24 with phase-33/001.

## Context

A reviewer may discover additional findings after each fix, and transient
subagent/tool failures can cause retries. Unlimited retries can loop without
learning, while a single pass can falsely imply that all defects were
enumerated.

## Decision

Allow an initial review followed by at most three fix rounds, at most five
completed logical reviewer invocations including final clean-room
confirmation, and at most two transient retries per logical invocation.
Repeated fingerprints or two rounds without blocker-count improvement produce
`NO_PROGRESS`; remaining blockers or exhausted transient retries produce
`NEEDS_HUMAN_REVIEW`. Any code change invalidates an earlier clean result.

Final clean-room confirmation is required after a P1, after two or more fix
rounds, or for the high-risk surfaces enumerated in phase-33/001.

## Rationale

Multiple complete-change passes acknowledge incomplete discovery, while fixed
limits and explicit progress tests prevent self-approval and unbounded agent
loops. Separate transient attempts from logical review rounds so capacity
failures do not masquerade as product findings.

## Consequences

Positive:

- Retry consumption and remediation progress become visible and auditable.
- Findings cannot be silently converted into acceptance when budget runs out.
- High-risk changes receive independent confirmation.

Negative:

- Some valid changes will require human review after budget exhaustion.
- Orchestration must track snapshots, fingerprints, counts, and attempt types.
- Five logical reviews can still be expensive on a large change.
