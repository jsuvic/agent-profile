# Phase 28

Repository release automation: turn the six-step manual release into two
human actions (trigger release-prepare, merge the bump PR) with
auto-tagging, verification-gated npm publishing via OIDC trusted
publishing (no stored token, provenance attestations), and an idempotent,
guard-checked pipeline. Repo tooling only - APC the product gains no
execution or network path.

## Specs

- `001-release-automation.md` - approved 2026-07-09 (accepts ADR 0012).
  Synthesized from the Path A / Path B
  design-it-twice: full OIDC pipeline chosen over semi-automatic
  (auto-tag + manual OTP publish), which remains the graceful-degradation
  shape if trusted publishing is ever unavailable.

Planned:

- `002` - security-review GitHub Action (anthropics/
  claude-code-security-review) on pull requests, with the prompt-injection
  caveat (trusted PRs only) and API-key cost consideration; plus the
  security-review capability pack idea for consuming projects
  (phase-later).

## Issues

- `issues/001-release-scripts-prepare-workflow.md` (I1)
- `issues/002-auto-tag-workflow.md` (I2, parallel-safe with I1)
- `issues/003-publish-job.md` (I3, sequenced after I1)
- `issues/004-trusted-publisher-rehearsal.md` (I4, human-gate:
  maintainer npm settings + the 0.4.2 live rehearsal)

Task states are tracked in the root `TASKS.md` ledger.

## Decisions

- ADR 0012 (proposed): OIDC trusted publishing over npm automation
  tokens - no long-lived credential, provenance on, scoped workflow
  authority.
- Release logic lives in unit-tested `scripts/release/*.mjs`; workflow
  YAML stays thin wiring.
- First live run rehearses with a `dry-run` input before publishing.
