# Spec: Knowledge Baseline Freshness Release Gate (WS4 addendum)

## Status

Approved 2026-07-03 (maintainer-requested addendum to
`phase-19/001-mcp-recommendation-scan.md`); implemented the same day.

## Problem

`phase-19/001` pins the `KNOWLEDGE_BASELINES` table in
`packages/doctor/src/mcpSuggestions.ts` with a `knownAsOf` date and states that
"versions are pinned by the release process and never fetched dynamically"
(WS4-MCP-003). Nothing in the release process actually enforces that the
pinned versions and `knownAsOf` are reviewed before a release. A forgotten
baseline silently degrades the scan (by design, per the detection rule), but
an arbitrarily old `knownAsOf` shipped in a fresh release undermines the
baseline-honesty contract without any signal to the maintainer.

## Goal

Make baseline review a mechanical part of the release path:

1. A release-checklist entry in `docs/release.md` requiring review of the
   `KNOWLEDGE_BASELINES` versions and `knownAsOf` before tagging.
2. An offline script, `scripts/check-baseline-age.mjs`, that fails when any
   `knownAsOf` date in `packages/doctor/src/mcpSuggestions.ts` is older than
   6 calendar months relative to the build date. It is wired into the release
   verification path (`docs/release.md` pre-publish checklist and
   `.github/workflows/release-verify.yml`) only.

## Non-Goals

- No network access of any kind (WS4-MCP-001 applies to this script too): the
  script never queries a registry to find "current" versions; it only checks
  the age of the pinned date.
- No automatic bumping of baseline versions or `knownAsOf`.
- No wiring into `npm test`, `npm run check`, or the regular `verify.yml` CI:
  unit tests and routine CI must stay time-independent. Only the release path
  is time-aware.
- No runtime behavior change in the doctor scan itself.

## Contracts (binding)

- WS4-BASE-001: the script performs no network access; it reads exactly one
  local file (`packages/doctor/src/mcpSuggestions.ts`).
- WS4-BASE-002: the script fails (exit 1) when any `knownAsOf` ISO date found
  in that file is older than 6 calendar months relative to the build date.
- WS4-BASE-003: the build date defaults to the current UTC date and can be
  overridden with `AGENT_PROFILE_BUILD_DATE=YYYY-MM-DD` for deterministic
  verification. An invalid override fails (exit 1).
- WS4-BASE-004: finding zero `knownAsOf` dates is a failure (exit 1), so a
  refactor of the baseline module cannot silently disable the gate. If the
  baseline table moves, the script must be updated in the same change.
- WS4-BASE-005: the script is invoked only from the release path
  (`release-verify.yml` and the manual pre-publish checklist), never from
  `npm test` or `npm run check`.

## Security Rules

- No secrets read; no environment values printed other than the optional
  `AGENT_PROFILE_BUILD_DATE` override, which is a date, not a secret.
- No file mutation; read-only.

## Acceptance Criteria

- `node scripts/check-baseline-age.mjs` exits 0 when every `knownAsOf` is
  within 6 calendar months of the build date, and exits 1 with a message
  naming the stale date(s) otherwise.
- With the current `knownAsOf: 2026-07-04` (reviewed against the npm registry
  on 2026-07-04): `AGENT_PROFILE_BUILD_DATE=2027-01-04
  node scripts/check-baseline-age.mjs` passes (expiry day itself is allowed);
  `AGENT_PROFILE_BUILD_DATE=2027-01-05` fails. Re-pin these example dates
  whenever the baseline is bumped so the check stays reproducible.
- `docs/release.md` pre-publish checklist requires baseline review and runs
  the script; `release-verify.yml` runs it as a step.
- `npm test`, `npm run check`, and `verify.yml` are unchanged.

## Tests

Time-dependence makes a conventional unit test inappropriate here (the repo's
unit tests must stay time-independent), so verification is procedural and
deterministic via WS4-BASE-003:

- Run the script with `AGENT_PROFILE_BUILD_DATE` pinned to a date within
  6 months of the shipped `knownAsOf` (expect exit 0) and to a date just past
  6 months (expect exit 1). Both runs are recorded in the implementing
  change's verification notes.
- This is static/procedural evidence, weaker than a regression test; accepted
  because the script is release-tooling, not shipped product code.

## Documentation Updates

- `docs/release.md`: new pre-publish checklist entry (review baselines, run
  the script).

## Final Review Checklist

- Script is offline and read-only.
- Gate cannot be silently disabled by moving the baseline table
  (WS4-BASE-004).
- Unit tests and routine CI remain time-independent.
- 6-month threshold uses calendar months in UTC.
