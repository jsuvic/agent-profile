# Spec: Temporary Shallow Init Stack Scan

## Status

Approved.

Temporary workaround. This spec extends the verified Phase 5 stack-detection
behavior only for `agent-profile init`. It is expected to be superseded by
`docs/specs/phase-later/007-monorepo-cascading-config.md` when workspace and
per-package profile behavior is approved and implemented.

This spec also adds a temporary React/JavaScript metadata bridge so React
projects can benefit from `docs/specs/phase-10/001-react-stack-guidance.md`
without requiring a hand-authored profile before first init.

## Problem

`agent-profile init` currently detects stack metadata only at the repository
root. Real projects often keep runnable applications in child folders such as
`api/`, `client/`, `apps/web/`, or `services/api/`.

Example failure:

- root contains no `package.json`, `pom.xml`, `tsconfig.json`, or other
  supported metadata
- `api/pom.xml` declares a Java Spring Boot application
- `client/package.json` declares a React frontend
- `agent-profile init --write` reports no detected language and refuses to
  write `ai-profile.yaml`

The refusal blocks useful setup even though language-neutral outputs such as
subagent guidance, workflow rules, permissions, and client scaffolding remain
valuable.

## Goal

Add a narrow temporary workaround for `agent-profile init`:

- scan root plus shallow child project roots for allowlisted metadata
- aggregate detected signals into the single root profile
- ask interactive users for manual language slugs when no language is detected
- use `unknown` as a schema-compatible fallback when no detected or manually
  entered language is available
- report compact detection-source details in wizard text and JSON output
- temporarily detect React and JavaScript from package metadata

The generated `ai-profile.yaml` schema remains unchanged.

## Intent

Unblock first-run setup while preserving the local-first and metadata-only
safety model. This workaround should make current init behavior more useful,
but it must not become a hidden implementation of monorepo cascading config.

## Decision Rules

- Prefer metadata-only reads over source inspection.
- Prefer bounded false negatives over noisy false positives.
- Keep temporary behavior visible in reports so users can correct it.
- Aggregate shallow child signals into the existing single root profile.
- Do not create per-package ownership, per-package profiles, or per-package
  output rules in this spec.
- Treat `unknown` as a fallback slug, not a real ecosystem.
- Treat `unknown` as inert for conditional guidance: it may appear in generic
  stack lists, but it must not select language-specific templates, guidelines,
  skills, or generated sections.
- Treat React and JavaScript detection as transitional bridges to future stack
  and workspace specs.
- Treat aggregated shallow stacks as best-effort. They may need doctor-guided
  migration or re-init when real workspace support supersedes this workaround.

## Non-Goals

- full monorepo cascading config
- `--workspace` or `--package` CLI flags
- per-package `ai-profile.yaml` files
- per-package generated artifacts
- package boundary ownership rules
- dependency graph resolution
- package-manager execution
- package installation
- source-code scanning
- lockfile parsing
- README, comments, or prose inference
- hosted execution or remote analysis
- writes outside the normal `init` output set
- changing schema v1
- making `unknown` a real language guidance target
- detecting React Native from `react-native`
- reading `peerDependencies`, `optionalDependencies`, or package lockfiles

## User Flow

1. A user runs `agent-profile init`.
2. The scanner checks candidate project-root directories at relative depth 0,
   1, and 2 under the repository root.
3. The scanner reads only allowlisted metadata files from candidate project
   roots that are not skipped.
4. The wizard shows the aggregated detected stack and a compact source summary.
5. If no language is detected and the wizard is interactive, the user is asked
   whether to enter language slugs manually.
6. If the user chooses manual entry, the wizard accepts comma-separated slugs,
   trims each token, lowercases each token, and validates the normalized slugs.
7. If any normalized token is invalid, the wizard rejects the whole entry and
   re-prompts in interactive mode.
8. If valid manual slugs are provided, those slugs become
   `stack.languages`.
9. If the user declines, submits an empty list, or init is non-interactive,
   `stack.languages` uses `unknown`.
10. `init --write` writes a schema-valid `ai-profile.yaml` instead of refusing
   solely because no language was detected.

Example shallow project layout:

```text
.
|-- api
|   `-- pom.xml
`-- client
    |-- package.json
    `-- vite.config.js
```

Expected aggregate stack:

```yaml
stack:
  languages:
    - java
    - javascript
  frameworks:
    - react
    - spring-boot
    - vite
  packageManagers:
    - maven
    - npm
  testing: []
```

Example source summary text:

```text
Detection sources:
- api/pom.xml: languages=java; frameworks=spring-boot; packageManagers=maven
- client/package.json: languages=javascript; frameworks=react; packageManagers=npm
- client/vite.config.js: frameworks=vite
```

## Inputs

The scanner may inspect directory entries under `--root` only to find candidate
project roots. Directory skip rules are applied to each `readdir` entry before
descent, so skipped directories such as `node_modules` are never opened.

Candidate project roots:

- `.` relative to `--root`
- direct child directories of `--root`
- grandchild directories of `--root`

Candidate project-root directories are at relative depth 0, 1, or 2. Metadata
at deeper paths is not scanned even if the file itself is reachable. For
example, `apps/web/package.json` is in scope, but
`apps/web/src/package.json` is out of scope.

Examples that are in scope:

- `.`
- `api`
- `client`
- `apps/web`
- `services/api`

Examples that are out of scope:

- `apps/mobile/ios/app`
- any directory outside `--root`
- any symlinked directory
- any skipped directory

Symlink and reparse-point rules:

- A user-supplied `--root` may be a symlink only if it resolves to a directory
  and the resolved directory becomes the scan boundary.
- Candidate child directories that are symlinks, junctions, or other reparse
  points are skipped.
- Allowlisted metadata files that are symlinks are skipped, including symlinks
  that point back inside `--root`.
- Tests for symlinked directories and symlinked metadata files must use
  portable fixtures where possible. Windows junction coverage may use a
  platform-specific fixture or an explicit test note when the runner cannot
  create junctions safely.

Skipped directories:

- any directory whose basename starts with `.`, except the root itself
- `node_modules`
- `target`
- `dist`
- `build`
- `coverage`
- `vendor`
- `tmp`
- `temp`
- `out`

The explicit hidden-directory rule covers `.git`, `.cce`, `.codex`, `.claude`,
`.dart_tool`, `.svelte-kit`, `.next`, and similar tool directories.

Allowlisted metadata file basenames remain the Phase 5 and Flutter/Dart
allowlist:

- `package.json`
- `tsconfig.json`
- `vite.config.js`
- `vite.config.mjs`
- `vite.config.cjs`
- `vite.config.ts`
- `vite.config.mts`
- `vite.config.cts`
- `svelte.config.js`
- `svelte.config.mjs`
- `svelte.config.cjs`
- `svelte.config.ts`
- `pom.xml`
- `build.gradle`
- `build.gradle.kts`
- `playwright.config.js`
- `playwright.config.mjs`
- `playwright.config.cjs`
- `playwright.config.ts`
- `playwright.config.mts`
- `playwright.config.cts`
- `pubspec.yaml`

Package metadata detection may read only these `package.json` keys:

- `name`
- `dependencies`
- `devDependencies`
- `engines`
- `packageManager`

Detection is based on dependency key names, not dependency values.
`peerDependencies`, `optionalDependencies`, `bundleDependencies`, lockfiles,
and package-manager metadata files are intentionally ignored.

Manual language fallback accepts comma-separated slugs with these limits:

- each token is trimmed and lowercased before validation
- maximum 10 slugs
- each slug length 1 to 40 characters
- slug pattern `^[a-z0-9][a-z0-9._-]*$`
- duplicates removed
- final list sorted deterministically

If any token is invalid, the whole entry is invalid. Interactive mode re-prompts
instead of accepting a partial list. Non-interactive mode cannot reach manual
entry and uses `unknown` when detection yields no language.

## Outputs

Generated profile:

- same `ai-profile.yaml` schema as today
- aggregate stack arrays are sorted and unique
- `stack.languages` is non-empty because it contains detected languages,
  valid manual slugs, or `unknown`

Wizard text:

- keeps the existing detected stack summary
- adds a compact source summary when shallow sources are inspected
- reports `(none)` when no source produced a signal
- reports when `unknown` was used because no language was detected or provided

JSON output:

- keeps existing init fields
- adds a `detectionSources` array
- for no-language fallback, reports normal dry-run/write success rather than a
  refused result with reason `no language detected`

JSON source-summary shape:

```json
{
  "detectionSources": [
    {
      "path": "api/pom.xml",
      "signals": {
        "languages": ["java"],
        "frameworks": ["spring-boot"],
        "packageManagers": ["maven"],
        "testing": []
      }
    }
  ]
}
```

The JSON summary must not include file contents, dependency values, URLs, paths
from dependency declarations, secret-like values, or environment values.
`detectionSources` entries are sorted by `path` ascending. Signal arrays inside
each source are sorted and unique.

## Detection Rules

Existing Phase 5 and Flutter/Dart signal maps remain valid for a candidate
project root.

Temporary React bridge:

| Signal | Output |
| --- | --- |
| `package.json.dependencies` contains key `react` | `stack.frameworks += "react"` |
| `package.json.devDependencies` contains key `react` | `stack.frameworks += "react"` |
| `package.json.dependencies` contains key `react-dom` | `stack.frameworks += "react"` |
| `package.json.devDependencies` contains key `react-dom` | `stack.frameworks += "react"` |

`react-native` is intentionally not a signal in this workaround. React Native
requires a separate ecosystem spec.

Temporary JavaScript bridge:

| Signal | Output |
| --- | --- |
| candidate project root has `package.json` and no TypeScript signal in that same candidate root | `stack.languages += "javascript"` |

TypeScript signals in the same candidate root are:

- `tsconfig.json` exists
- `package.json.dependencies` contains key `typescript`
- `package.json.devDependencies` contains key `typescript`

If a candidate root has a TypeScript signal, do not add `javascript` for that
same candidate root.

This rule is per candidate root, not global. If `client-js/package.json` is
JavaScript-only and `client-ts/package.json` has a TypeScript signal, the
aggregate root profile may contain both `javascript` and `typescript`.

## Contracts

- Existing root-only metadata detection remains compatible.
- Non-workspace compile behavior is unchanged.
- Generated output schema is unchanged.
- Output arrays remain sorted and unique.
- Detection failures remain warnings, not fatal errors.
- Malformed metadata warnings must not include file contents.
- Detection-source reporting is informational and does not change the profile
  schema.
- `unknown` may appear in generic stack rendering such as `## Stack`, but it
  must not trigger language-specific guidance files, conditional AGENTS.md
  sections, target templates, skills, or instructions.
- Doctor should emit a non-fatal warning when a persisted profile contains
  `stack.languages: [unknown]` or includes `unknown` alongside other language
  slugs, with guidance to replace it when the real language is known.
- Absence of React metadata must not emit React guidance.
- React detection is metadata-only and temporary.
- JavaScript detection is metadata-only and temporary.
- Source scanning remains out of scope.
- Symlinks are not followed.
- Aggregated shallow stacks are best-effort. When workspace support from
  phase-later 007 lands, users may need re-init, manual profile edits, or
  doctor-guided migration to split root-level aggregate stack values into
  package-specific profiles.

## Security Rules

- Do not upload metadata files.
- Do not read source files.
- Do not read `.env` or `.env.*`.
- Do not read lockfiles.
- Do not read generated outputs or build artifacts.
- Do not read hidden/tool directories.
- Apply skip-list filtering before descending into a directory.
- Do not read secret files.
- Do not execute package-manager commands.
- Do not install dependencies.
- Do not read environment variable values.
- Do not print metadata file contents in warnings or reports.
- Do not print dependency versions, dependency URLs, path dependency values, or
  secret-like values.
- Do not write outside the normal `init` outputs.

## Acceptance Criteria

- A root with `api/pom.xml` detects `java`, `maven`, and `spring-boot`.
- A root with `client/package.json` and `client/vite.config.js` detects `npm`
  and `vite`.
- A `client/package.json` with `react` or `react-dom` dependency keys detects
  `react`.
- A `client/package.json` without a TypeScript signal detects `javascript`.
- A `client/package.json` with `typescript` dependency or `tsconfig.json` in
  the same candidate root detects `typescript` and does not add `javascript`
  for that candidate root.
- Sibling JavaScript-only and TypeScript package roots may aggregate both
  `javascript` and `typescript`.
- Candidate directories deeper than relative depth 2 are not scanned.
- Skipped directories are not scanned.
- Symlinked directories are not followed.
- Symlinked allowlisted metadata files are not read.
- `.env`, lockfiles, source files, generated files, and build output files are
  not opened during detection.
- Interactive no-language init offers manual language entry.
- Manual language input trims, lowercases, dedupes, sorts, accepts valid
  comma-separated slugs, and rejects invalid slugs.
- Interactive invalid manual language input re-prompts and does not accept
  partial valid lists.
- Manual language input enforces max 10 slugs and max 40 characters per slug.
- Empty or declined manual language input uses `unknown`.
- Non-interactive no-language init uses `unknown`.
- `init --write` no longer refuses solely because no language was detected.
- `init --json --write` for no-language fallback reports a successful write
  result with `unknown`, not a refused result.
- Wizard output includes a compact source summary.
- JSON output includes `detectionSources`.
- `detectionSources` ordering is stable by path ascending.
- `unknown` does not trigger language-specific guidance outputs.
- Doctor emits a non-fatal warning for persisted `unknown`.
- Generated `ai-profile.yaml` remains schema-valid.
- Existing Phase 5 and Flutter/Dart stack detection tests still pass.

## Tests

- Scanner unit test: nested `api/pom.xml` produces `java`, `maven`, and
  `spring-boot`.
- Scanner unit test: nested `client/package.json` and `client/vite.config.js`
  produce `javascript`, `react`, `npm`, and `vite` when no TypeScript signal is
  present.
- Scanner unit test: nested TypeScript React package produces `typescript` and
  `react`, not `javascript`.
- Scanner unit test: sibling JavaScript-only and TypeScript package roots
  aggregate both `javascript` and `typescript`.
- Scanner unit test: max-depth-2 scan ignores deeper metadata.
- Scanner unit test: skipped directories are ignored.
- Scanner sentinel test: `.env`, lockfiles, source files, generated files, and
  build output are not opened.
- Scanner sentinel test: symlinked directories are not followed.
- Scanner sentinel test: symlinked allowlisted metadata files are not read.
- Scanner deterministic-output test: `detectionSources` is sorted by path and
  nested signal arrays are sorted.
- CLI wizard test: no detected language prompts for manual language slugs and
  writes the supplied sorted unique slugs.
- CLI wizard test: manual language input normalizes case and whitespace.
- CLI wizard test: invalid manual language slugs are rejected and the wizard
  re-prompts.
- CLI wizard test: empty or declined manual language input writes `unknown`.
- CLI non-interactive test: no detected language writes `unknown`.
- CLI output test: wizard text includes detection-source summary.
- CLI JSON test: output includes `detectionSources`.
- CLI JSON test: no-language fallback reports normal success mode/status with
  `unknown`, not refusal.
- Compiler/golden regression test: `unknown` triggers no language-specific
  generated guidance.
- Doctor test: persisted `unknown` emits a non-fatal warning with replacement
  guidance.
- Regression test: existing no-metadata scanner output remains empty before
  init fallback is applied.
- Regression test: malformed metadata warning remains sanitized.
- Regression test: existing root-only Phase 5 fixture outputs remain
  compatible.
- Regression test: Flutter/Dart detection remains compatible.

## TDD Strategy

1. Add failing scanner tests for nested Java and nested React/JavaScript
   metadata.
2. Add failing scanner sentinel tests for skipped directories, directory
   symlinks, file-level metadata symlinks, source files, lockfiles, build
   outputs, and secret-like files.
3. Implement the shallow candidate-root discovery and per-root metadata
   aggregation.
4. Add failing scanner tests for the React and JavaScript bridges.
5. Implement the package metadata bridge.
6. Add failing CLI tests for manual language fallback, normalization,
   invalid-input re-prompting, and `unknown` fallback.
7. Implement the init fallback behavior.
8. Add failing CLI text and JSON reporting tests for detection sources.
9. Implement source-summary reporting.
10. Add failing compiler/doctor tests that prove `unknown` is inert for
    guidance and visible as a doctor warning.
11. Run scanner, CLI, golden, doctor/check, and package verification commands
    required by the project workflow.

## Issue Plan

Detailed issue briefs are tracked in
`docs/specs/phase-later/021-temporary-shallow-init-stack-scan-issues.md`.

Vertical slices:

1. temporary shallow metadata scan for `init`
2. temporary React and JavaScript package metadata bridge
3. manual no-language fallback and `unknown` fallback
4. detection-source reporting and documentation

## Documentation Updates

- Add this spec.
- Update `README.md` with the temporary init behavior or explicitly state that
  the root README keeps the stable root-detection summary while
  `docs/cli/README.md` documents the temporary workaround.
- Update `docs/cli/README.md` with temporary shallow init scan behavior.
- Document manual language entry and `unknown` fallback.
- Document that phase-later 007 supersedes this workaround.
- Document that React/JavaScript detection is temporary metadata-only behavior.
- Document that React Native and `peerDependencies` are out of scope.

## Final Review Checklist

- Build a spec-to-test matrix for every MUST and acceptance criterion.
- Verify runtime sentinels prove no source, lockfile, secret, hidden/tool, or
  generated/build files are read.
- Verify no package-manager commands are executed.
- Verify symlinks are not followed.
- Verify `unknown` does not emit language-specific guidance.
- Verify doctor warns when `unknown` is persisted.
- Verify React guidance only appears when `react` is present in
  `stack.frameworks`.
- Verify generated `ai-profile.yaml` is schema-valid.
- Verify output is deterministic across runs.
- Verify `detectionSources` ordering is stable.
- Verify wizard re-prompts on invalid manual language entry.
- Verify existing Phase 5 and Flutter/Dart tests remain compatible.
- Verify JSON reporting contains paths and signal slugs only, never file
  contents or dependency values.
- List remaining risks and the intended superseding spec path.
