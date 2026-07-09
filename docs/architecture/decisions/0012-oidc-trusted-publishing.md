# ADR 0012: OIDC Trusted Publishing Over npm Automation Tokens

## Status

Accepted 2026-07-09 with phase-28/001 spec approval.

## Context

Releases require publishing three npm packages. The maintainer account
uses 2FA, so publishes are manual OTP ceremony. Automating publish
conventionally means an npm automation token stored as a GitHub secret -
a long-lived credential that bypasses 2FA and survives until rotated.
The 0.4.0 release also demonstrated the human failure mode: publishing
from an uncommitted tree with no reproducing commit.

## Decision

CI publishes via npm trusted publishing (OIDC): npmjs.com is configured
to trust this repository's `release-verify.yml` workflow identity for
each public package, and the publish job authenticates with a
short-lived OIDC token (`permissions: id-token: write` on that job only)
and publishes with `--provenance`. No npm token is ever created or
stored; interactive human publishes keep 2FA unchanged.

## Rationale

A stored automation token is the thing 2FA exists to prevent - a
credential that publishes silently and leaks quietly. OIDC identity is
scoped (one repo, one workflow, one package), short-lived, and produces
provenance attestations that let consumers verify the artifact was built
from this repository by CI - a strict supply-chain upgrade consistent
with the project's local-first, no-secret principles. The reference
ecosystem practice is established (e.g. `@clack/prompts` publishes with
OIDC trusted-publisher attestations). Alternatives considered: automation
token in GitHub secrets (rejected: long-lived 2FA bypass); staying fully
manual (rejected: repeated OTP ceremony and the demonstrated
uncommitted-tree failure mode).

## Consequences

Positive:

- No long-lived publish credential exists anywhere.
- Provenance attestations on every published package.
- Publish preconditions (tag on master, version match, verification in
  the same run) are mechanical, not procedural.

Negative:

- The workflow identity becomes publish authority: repository compromise
  implies publish ability, mitigated by scoped permissions, tag-only
  triggers, and mandatory pre-publish verification.
- One-time manual trusted-publisher setup per package on npmjs.com, and
  a registry-feature dependency (trusted publishing availability).
