# Spec: MCP Recommendation Scan - static, offline (WS4)

## Status

Implemented on 2026-07-03 (approved the same day).

Implementation lives in `packages/doctor/src/mcpSuggestions.ts` (shared
catalog, baseline, detection rule, scan) with tests in
`packages/doctor/src/mcpSuggestions.test.ts` and CLI wiring plus tests in
`apps/cli/src/index.ts` / `apps/cli/src/index.test.ts`. The byte-stable
golden fixtures for text and `--json` stdout live in
`fixtures/doctor-mcp-suggestions/` (input `package.json` plus `expected/`
outputs).

Synthesized from the WS4 candidate in
`docs/plans/003-ws3-ws7-spec-synthesis.md` (WS4-MCP-001..006).

## Problem

A project may declare frameworks, runtimes, or SDKs newer than an AI client's
likely knowledge, where current documentation via MCP would help. Any freshness
check that reaches a registry or package-doc endpoint is a network call, which
the product forbids by default. The Phase 12 `mcp-fit-check` skill
(`phase-12/005`) advises the agent but never inspects the actual project, and
explicitly defers this static scan to WS4.

## Goal

Add a fully static, offline recommendation scan, surfaced through
`agent-profile doctor --mcp-suggestions`, that flags declared dependencies newer
than APC's pinned knowledge baseline and points to curated MCP candidate ids.
The scan is informational only: it writes nothing, calls no network, and never
raises the doctor exit code.

It also ships the shared `McpCandidate` catalog and `KnowledgeBaseline` table
modules that the later WS3 `init --assist` slice imports for its
`suggestedMcpCandidates` enum.

## Non-Goals

- MCP config generation, install, server commands, env var names, tokens, URLs,
  or arbitrary MCP ids.
- Any network, registry, package-doc, or model-knowledge probe.
- Writing or repairing files; changing client runtime settings.
- Comparing versions for ecosystems other than npm in v1 (see Ecosystem Scope).
- The WS3 `init --assist` invocation, validator, or recommendation mapping.

## User Flow

```bash
agent-profile doctor --mcp-suggestions
agent-profile doctor --mcp-suggestions --json
```

1. The scan reads declared dependencies from the project root (the same
   dependency sources doctor already inspects; no lockfile network resolution).
2. Each dependency is normalized and matched against the shipped baseline table.
3. A dependency whose stable version is greater than the baseline `knownVersion`
   produces one informational suggestion carrying the curated candidate ids.
4. Unknown packages produce nothing; non-comparable versions produce a distinct
   informational note.
5. Output is rendered as informational doctor issues (text or JSON). Exit code is
   unaffected. Without the flag, doctor behaves exactly as `phase-04/002`.

## Inputs

- `--mcp-suggestions` flag on the existing `doctor` command.
- `--json` (existing) and `--root <path>` (existing) flags.
- Declared project dependencies (manifest files doctor already reads).
- The shipped `McpCandidate` catalog and `KnowledgeBaseline` table.

## Outputs

Informational doctor issues only. Two shared modules are produced as source:

```ts
type McpCandidate = {
  id: McpCandidateId;            // closed enum
  label: string;
  category: "docs" | "repo" | "testing" | "database" | "filesystem";
  risk: "low" | "medium" | "high";
  requiresSecrets: boolean;
  networkRequired: boolean;
  configGeneration: "not-supported-in-ws4" | "later-opt-in";
};

type KnowledgeBaseline = {
  packageName: string;
  ecosystem: "npm" | "maven" | "python" | "cargo" | "go";
  knownVersion: string;
  knownAsOf: string;             // release/catalog build date, ISO 8601
  candidateIds: McpCandidateId[];
  riskCode: "new_framework_version";
};
```

Versions are pinned by the release process and never fetched dynamically. The
`ecosystem` field is retained for forward compatibility, but only `npm` entries
are version-compared in v1 (see Ecosystem Scope).

## Doctor Integration

- A new non-gating severity `info` is added to the doctor issue model.
- `info` issues never raise `status` above `pass` and never change the exit code.
  A run whose only findings are `info` reports `status: "pass"` and exits `0`,
  preserving the `phase-04/002` contract that exit `1` requires an `error`.
- The `DoctorCliJson.status` enum (`pass | warn | fail`) is unchanged; `info`
  issues are carried in `issues[]` with `severity: "info"`.
- `info` issues follow the existing ordering, text-format (`[info] CODE path`),
  and redaction rules of the doctor package. The CLI must not duplicate scan
  logic; the scan lives in the doctor package.

### Issue Codes

- `MCP-SUGGEST-NEW-FRAMEWORK` (`riskCode: new_framework_version`): a declared
  dependency is newer than the pinned baseline. Message names the package,
  detected version, baseline `knownVersion`, `knownAsOf`, and the curated
  candidate ids. Wording is honest: "newer than APC's pinned baseline
  (as of <knownAsOf>); current docs may help" - never "the model does not know
  X".
- `MCP-SUGGEST-UNCOMPARABLE`: the declared version is a range, prerelease,
  workspace alias, git URL, or otherwise non-semver. Informational note only; no
  staleness claim, no candidate ids implied by staleness.

## Detection Rule

1. Normalize the package name; find the matching baseline entry.
2. Parse the detected version.
3. Stable semver strictly greater than `knownVersion` -> emit
   `MCP-SUGGEST-NEW-FRAMEWORK` with the entry's curated candidate ids.
4. Unknown package (no baseline entry) -> emit nothing.
5. Range / prerelease / workspace alias / git URL / non-semver ->
   `MCP-SUGGEST-UNCOMPARABLE`, informational only.
6. A stale baseline (old `knownAsOf`) never errors; it degrades to fewer or no
   suggestions.

## Ecosystem Scope

`KnowledgeBaseline.ecosystem` carries five values for forward compatibility, but
v1 only version-compares `npm` entries, because maven/python/cargo/go ordering
semantics differ from semver and are out of scope for this slice. Non-`npm`
baseline entries, if present, are ignored by the detection rule in v1 rather than
compared with semver. A later slice may add per-ecosystem comparators; this is
recorded, not implemented here.

## Contracts (binding)

- WS4-MCP-001: no network calls, ever. Proven by an offline network sentinel.
- WS4-MCP-002: candidates come only from the shipped curated catalog.
- WS4-MCP-003: freshness comes only from the shipped known-as-of baseline table.
- WS4-MCP-004: output names candidate ids only - no server commands, install
  commands, config paths, tokens, URLs, or arbitrary MCP names. This is enforced
  as a doctor-output redaction contract, mirroring `phase-04/002`.
- WS4-MCP-005: unknown package or non-comparable version -> no staleness claim.
- WS4-MCP-006: recommendations are informational; the scan cannot write MCP
  config or any file, and cannot change the exit code.
- The `McpCandidate` catalog is a shared module; WS3's `suggestedMcpCandidates`
  enum imports `McpCandidateId` from it. The enum is closed; adding a candidate
  is a source change reviewed at release time.
- `doctor` without `--mcp-suggestions` produces byte-identical output to
  `phase-04/002`.

## Security Rules

- No secrets read; no environment values printed.
- No network, registry, package-doc, or model-knowledge access.
- No execution, install, or file mutation.
- No literal MCP server commands, tokens, URLs, or install commands in output.
- Dependency contents beyond name and version are not echoed.

## Acceptance Criteria

- The scan runs offline; a network sentinel test proves no network access.
- A dependency newer than its baseline entry yields exactly one
  `MCP-SUGGEST-NEW-FRAMEWORK` info issue carrying the curated candidate ids.
- A non-comparable version yields `MCP-SUGGEST-UNCOMPARABLE`; an unknown package
  yields nothing.
- No MCP config, command, token, or URL is ever emitted.
- An info-only run reports `status: "pass"` and exits `0`.
- `doctor` without the flag is byte-identical to the `phase-04/002` baseline.
- Output is deterministic and byte-stable across repeated runs.

## Tests

- Network sentinel: any network access during the scan fails the test (runtime
  sentinel, not import inspection alone).
- Detection table (table-driven): newer stable version -> NEW-FRAMEWORK;
  equal/older -> nothing; range/prerelease/workspace/git/non-semver ->
  UNCOMPARABLE; unknown package -> nothing.
- Redaction: assert emitted issues contain no URL, token, install command, or
  server command, only candidate ids and pinned metadata.
- Exit code: info-only run exits `0` with `status: "pass"`; a fixture mixing an
  `error` and an `info` still exits `1` and orders issues per the doctor package.
- Golden fixtures: text and `--json` output for a fixture with one NEW-FRAMEWORK
  and one UNCOMPARABLE finding; byte-stable.
- Baseline honesty: message includes `knownAsOf`; a stale baseline fixture
  degrades to no suggestion without error.
- No-flag regression: `doctor` output byte-identical to the `phase-04/002`
  baseline fixture.

## TDD Strategy

RED: network sentinel test plus a detection table test and an exit-code test that
fail before the scan and severity exist. GREEN: add the shared catalog/baseline
modules, the `info` severity mapping, and the detection rule; wire the
`--mcp-suggestions` flag to the doctor package.

## Issue Plan

- WS4-I1: shared `McpCandidate` catalog + `KnowledgeBaseline` table modules.
  `ready`. Blocks WS4-I2/I3 and WS3-I1.
- WS4-I2: detection rule (semver compare, non-comparable, unknown).
  `sequenced` after WS4-I1.
- WS4-I3: `doctor --mcp-suggestions` informational output, `info` severity, and
  WS4-MCP-001..006 with the network sentinel test. `sequenced` after WS4-I2.

## Documentation Updates

- `README.md` and CLI reference: the `--mcp-suggestions` flag and its
  informational, non-gating behavior.
- Update `docs/plans/003-ws3-ws7-spec-synthesis.md` to point WS4 at this phase
  and note the WS3 catalog import.
- (`docs/targets/` does not exist in this repository; no mapping update
  applies. The shared catalog module is documented here and exported from
  `@agent-profile/doctor`.)

## Final Review Checklist

- Informational only; no affirmative install/config/network/token output.
- Honest staleness wording with `knownAsOf`.
- Exit code never raised by suggestions; `phase-04/002` contract preserved.
- Catalog and baseline are shipped, pinned, offline; no dynamic fetch path.
- Shared catalog module is importable by WS3 without pulling scan logic.
- Deterministic, byte-stable fixtures.
