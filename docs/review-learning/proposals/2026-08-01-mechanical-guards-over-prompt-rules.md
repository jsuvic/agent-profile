# Proposal: extend two mechanical guards instead of adding two prose rules

- Status: PROPOSED. Not applied.
- Raised by: record `5db443e` (phase-33 I14), promotion step.
- Target surfaces: `packages/compiler/src/change-risk-surface-coverage.test.ts`,
  `scripts/verify-self-applied-artifacts.test.mjs`.

Applying this proposal is a separate later change through the normal write
boundary, reviewed and invalidating as usual. Nothing here edits a human-owned
rule surface.

## Why a patch and not a rule

Two canonical categories reached their **second** counted occurrence in record
`5db443e`, after record `896F5F8050686A23`:
`cross-consumer-integration` and `parser-version-contract`.

The second-occurrence rule calls for a reviewer regression case plus a scoped
Code Review Rules rule, "unless an existing mechanical guard already provides
equivalent or stronger protection, in which case cite the guard instead". Both
occurrences here fail in a way a deterministic check can decide with no model
judgement, which is the condition the lifecycle names for preferring a guard.
A prompt rule is added only when model judgement remains part of the safe
decision, and in neither case does it.

## Proposal 1 — `cross-consumer-integration`

**Occurrence 1** (record `896F5F8050686A23`): this repository's own generated
reviewer artifacts went stale, so a shipped change was not in effect for the
agent actually running.

**Occurrence 2** (record `5db443e`): a new script that decides which committed
paths are generated-owned was declared under `network-process-execution` but
not under `generated-ownership`, so a later change widening its exemption list
would never have routed to an ownership review.

**Guard cited for the covered half.**
`packages/compiler/src/change-risk-surface-coverage.test.ts` already fails when
a non-test source imports `node:child_process` or performs an outbound fetch
and is not declared under `network-process-execution`. It caught occurrence 2's
new script on the first `npm test` run of that change, before any reviewer saw
it. That is strictly stronger than a prompt rule for what it covers, and I14's
own guard now closes occurrence 1's mechanism outright.

**Proposed extension, for the half it does not cover.** That test derives its
`generated-ownership` expectation from files carrying region markers plus the
declared output paths, so it can only ever see artifacts, never the code that
decides ownership. `regions.ts`, `golden.ts` and now
`verify-self-applied-artifacts.mjs` are all ownership implementations and all
had to be added by hand.

Sketch: assert that every module which reads or writes the
`ownership` field of a lockfile output, or which names a generated artifact
root, is declared under `generated-ownership`. A grep-shaped derivation over
`packages/compiler/src` plus `scripts` — the same shape the file's existing
`network-process-execution` scan already uses — keeps the derivation
deterministic and the failure message actionable.

Deliberate limit: this cannot be derived from emission, only from source
inspection, so it will have false positives on a module that merely passes
ownership through. Prefer an explicit allowlist of known pass-through modules
over loosening the scan, so the guard stays fail-closed.

## Proposal 2 — `parser-version-contract`

**Occurrence 1** (record `896F5F8050686A23`): a derivation guard's coverage
boundary was claimed more broadly than it held — it saw newly required
structured fields but not newly optional ones.

**Occurrence 2** (record `5db443e`): `parseOwnershipRefusal` matched one of
`compile`'s three refusal headers and one of its four reasons, so a mixed
refusal named a partial path list and the omitted paths looked clean.

**Shared mechanism.** Both are a consumer coupled to a producer's surface at a
narrower point than the producer actually varies, with the narrowing invisible
because the covered case is the common one.

**Proposed patch.** A focused test that enumerates the producer's variants from
the producer and asserts the consumer handles each. For the refusal parser
that is concrete and cheap: derive the header strings from
`apps/cli/src/index.ts` rather than restating them in
`scripts/verify-self-applied-artifacts.test.mjs`, so a fourth header added
later fails the parser's test rather than the gate at run time.

The current test hard-codes all three headers as literals, which pins today's
behaviour but does not fail when a fourth appears. That is the residual gap
this proposal closes.

## What is deliberately not proposed

No prose rule for either category. Both would restate what the proposed checks
decide mechanically, and the lifecycle is explicit that a redundant prompt rule
should be removed, retired, or reduced to navigation guidance rather than
added. If either proposed check proves impractical, the fallback is to record
the impracticality with rationale and evidence — not to fall back to prose by
default.
