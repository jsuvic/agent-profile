# Issue Briefs: Temporary Shallow Init Stack Scan

Parent spec: `docs/specs/phase-later/021-temporary-shallow-init-stack-scan.md`

Status: Approved issue plan.

These issue briefs are intentionally vertical behavior slices. They are not a
file-layer implementation plan.

## Dependency Map

| Issue | Dependency state | Depends on |
| --- | --- | --- |
| 1. Temporary shallow metadata scan for `init` | ready | none |
| 2. Temporary React and JavaScript package metadata bridge | sequenced | issue 1 candidate-root context |
| 3. Manual no-language fallback and `unknown` fallback | parallel-safe | none, but final integration depends on stack result shape |
| 4. Detection-source reporting and documentation | sequenced | issue 1 source-summary data |

## Parallelism Map

- Issue 1 should start first because it defines candidate project roots and
  source-summary data.
- Issue 2 is sequenced after issue 1 because the JavaScript-vs-TypeScript rule
  is scoped to the same candidate project root.
- Issue 3 can run in parallel with scanner work if it treats the scanner result
  as an input contract.
- Issue 4 should run after issue 1 so reporting tests use the final source
  summary shape.

## Human Gates

- Approve the parent spec before implementation.
- Confirm the final wizard wording for manual language entry before golden or
  byte-exact CLI output tests are updated.
- Confirm whether package metadata bridge release notes should call the
  behavior "temporary" or "transitional".
- Confirm whether the final README update should summarize the temporary
  behavior or point only to `docs/cli/README.md`.

## Issue 1: Temporary Shallow Metadata Scan For Init

### Title

Temporary shallow metadata scan for `init`.

### Parent Spec Or Request

`docs/specs/phase-later/021-temporary-shallow-init-stack-scan.md`.

### Intent Summary

Let `agent-profile init` detect supported stack metadata in common nested app
layouts without implementing full monorepo cascading config.

### Behavior Slice

Add scanner support for candidate project roots at relative depth 0, 1, and 2
under `--root`. Aggregate detected signals into the same stack arrays used by
the root profile. Record compact source-summary data for each metadata file
that produced a signal.

### Non-Goals

- no workspace mode
- no per-package profiles
- no per-package generated artifacts
- no source scanning
- no lockfile parsing
- no dependency execution
- no writes
- no React/JavaScript bridge in this issue unless needed as test fixture setup

### Acceptance Criteria

- root candidate `.` remains supported
- direct child candidate roots are supported
- grandchild candidate roots are supported
- candidates deeper than relative depth 2 are ignored
- skipped directories are ignored
- symlinked directories, junctions, and other reparse points are not followed
- symlinked allowlisted metadata files are skipped
- a symlinked `--root`, when supplied, resolves to the scan boundary and does
  not allow descendant symlinks to be followed
- nested `api/pom.xml` detects `java`, `maven`, and `spring-boot`
- nested `client/package.json` detects `npm`
- nested `client/vite.config.js` detects `vite`
- stack arrays are sorted and unique
- source-summary entries are sorted by relative metadata path
- malformed metadata warning paths remain relative and sanitized
- source-summary entries include only relative metadata paths and signal slugs

### Expected RED Proof

Add scanner tests with this temp layout:

```text
root/
  api/pom.xml
  client/package.json
  client/vite.config.js
```

The current scanner returns empty stack arrays when root has no metadata. The
new tests should fail before implementation.

Add a skipped-directory sentinel test with metadata under directories such as:

```text
root/node_modules/package.json
root/api/target/pom.xml
root/client/coverage/package.json
root/.hidden/package.json
root/client/package.json -> symlink to a metadata file
```

The test should fail before skip-aware shallow discovery exists.

### Expected GREEN Proof

The scanner returns aggregate stack values from supported nested metadata and
does not read skipped directories, symlinked directories, or symlinked
metadata files.

### Test Command Guidance

Preferred focused command:

```bash
npm test -- --test-name-pattern "detectStack|stack"
```

If the test runner does not support name filtering, run the scanner package test
command used by the repo.

### Likely File Ownership

- `packages/scanner/src/stack.ts`
- `packages/scanner/src/scanner.test.ts`
- exported scanner types if source-summary data needs a public type

### Dependencies

Ready.

### Parallelism Notes

This issue should establish the candidate-root and source-summary result shape
before issue 4 starts.

### Contract Impact

Extends metadata locations for init-time detection while preserving the
allowlisted metadata-only contract.

### Security Impact

Higher filesystem traversal risk than root-only detection. Must be covered by
runtime sentinels for skipped directories, directory symlinks, file-level
metadata symlinks, source files, lockfiles, build outputs, and secret-like
files.

### Documentation Impact

Parent spec and CLI docs must describe max depth, skip rules, and temporary
scope.

### Implementation Context

Existing Phase 5 detection checks only a resolved root path. The temporary
workaround should reuse the existing per-root metadata detection behavior where
possible instead of duplicating signal maps.

### Review Expectations

Reviewers should verify the implementation does not follow symlinks, does not
read source files, filters skipped directories before descent, sorts source
summaries, and does not scan beyond relative depth 2.

## Issue 2: Temporary React And JavaScript Package Metadata Bridge

### Title

Temporary React and JavaScript package metadata bridge.

### Parent Spec Or Request

`docs/specs/phase-later/021-temporary-shallow-init-stack-scan.md`.

### Intent Summary

Allow first-run init to produce React-aware guidance for package metadata that
clearly declares React, and produce a language slug for plain JavaScript
frontend packages without scanning source files.

### Behavior Slice

Within a candidate project root containing `package.json`:

- add `react` to `stack.frameworks` when dependency keys include `react` or
  `react-dom`
- add `javascript` to `stack.languages` when that same candidate root has
  package metadata but no TypeScript signal
- do not add `javascript` when that same candidate root has `tsconfig.json` or
  a `typescript` dependency key

### Non-Goals

- no JSX source scanning
- no React inference from README, comments, filenames, or build output
- no React Native detection from `react-native`
- no JavaScript inference from arbitrary `.js` files
- no peer dependency or optional dependency expansion unless explicitly added
  by a later spec
- no framework guidance changes beyond causing existing conditional React
  guidance to fire through `stack.frameworks: react`

### Acceptance Criteria

- `package.json.dependencies.react` detects `react`
- `package.json.dependencies.react-dom` detects `react`
- `package.json.devDependencies.react` detects `react`
- `package.json.devDependencies.react-dom` detects `react`
- package metadata with no TypeScript signal detects `javascript`
- package metadata with `tsconfig.json` detects `typescript`, not
  `javascript`
- package metadata with `dependencies.typescript` detects `typescript`, not
  `javascript`
- package metadata with `devDependencies.typescript` detects `typescript`, not
  `javascript`
- sibling JavaScript-only and TypeScript package roots may aggregate both
  `javascript` and `typescript`
- `react-native` does not detect `react`
- `peerDependencies.react` does not detect `react`
- dependency values are not reported or used
- outputs remain sorted and unique

### Expected RED Proof

Add scanner tests for:

```json
{
  "dependencies": {
    "react": "ignored",
    "react-dom": "ignored"
  }
}
```

Before implementation, `react` and `javascript` are not emitted.

Add a TypeScript React package fixture. Before implementation, the expected
React bridge should fail, and after implementation it should emit
`typescript`, not `javascript`.

Add sibling package fixtures where one candidate root is JavaScript-only and
another candidate root has a TypeScript signal. Before implementation, the
aggregate language behavior is undefined or missing; after implementation, the
aggregate contains both language slugs.

### Expected GREEN Proof

Scanner tests pass for JavaScript React and TypeScript React package metadata,
with no dependency value leakage.

### Test Command Guidance

Focused scanner tests first, then full scanner package tests.

### Likely File Ownership

- `packages/scanner/src/stack.ts`
- `packages/scanner/src/scanner.test.ts`

### Dependencies

Sequenced after issue 1 because the JavaScript-vs-TypeScript rule needs the
same-candidate-root context established by shallow discovery.

### Parallelism Notes

Can be developed while issue 3 works on CLI fallback behavior, but should not
merge before issue 1 defines candidate-root context.

### Contract Impact

Adds transitional stack signals. React is already schema-valid as a framework
slug. JavaScript is schema-valid as a language slug.

### Security Impact

Reads only allowlisted package metadata keys. Must not report dependency values
and must not read `peerDependencies`, `optionalDependencies`, or lockfiles.

### Documentation Impact

CLI docs and parent spec must mark React/JavaScript detection as temporary and
metadata-only.

### Implementation Context

Existing `package.json` detection already reads dependency maps for TypeScript,
SvelteKit, Vite, and Playwright. Prefer extending that metadata path rather
than adding a second parser.

### Review Expectations

Reviewers should confirm JavaScript is not emitted alongside TypeScript for the
same candidate root, sibling roots can aggregate both JavaScript and
TypeScript, React Native remains out of scope, and React detection does not
inspect source files.

## Issue 3: Manual No-Language Fallback And Unknown Fallback

### Title

Manual no-language fallback and `unknown` fallback.

### Parent Spec Or Request

`docs/specs/phase-later/021-temporary-shallow-init-stack-scan.md`.

### Intent Summary

Stop refusing useful setup solely because no language was detected. Give
interactive users a chance to provide accurate language slugs, and keep
non-interactive flows unblocked with a visible fallback.

### Behavior Slice

When `init` has no detected language:

- interactive wizard asks whether to enter language slugs manually
- manual entry accepts comma-separated slugs, trims each token, and lowercases
  each token before validation
- valid normalized slugs are deduped and sorted
- if any token is invalid, the whole entry is rejected with a clear validation
  message and interactive mode re-prompts
- empty or declined entry uses `unknown`
- non-interactive/no-prompt flows use `unknown`
- `init --write` writes a schema-valid profile instead of refusing solely for
  missing language detection
- `init --json --write` reports normal success for no-language fallback instead
  of a refused result
- doctor emits a non-fatal warning when a persisted profile contains
  `unknown`

### Non-Goals

- no schema change
- no language picker UI
- no ecosystem registry
- no source scanning to validate manual language entries
- no language-specific guidance for `unknown`
- no automatic replacement of `unknown` after later detection improves

### Acceptance Criteria

- manual input `java, javascript, java` writes `java` and `javascript`
- manual input ` Java, JAVASCRIPT ` writes `java` and `javascript`
- manual input is sorted deterministically
- invalid slug characters are rejected
- a partial list with valid slugs plus one invalid slug rejects the whole entry
  and re-prompts in interactive mode
- slug length greater than 40 is rejected
- more than 10 slugs are rejected
- empty input writes `unknown`
- declined manual input writes `unknown`
- non-interactive no-language flow writes `unknown`
- profile validation passes for manual language and `unknown` outputs
- `init --json --write` no-language fallback returns success mode/status and a
  profile stack containing `unknown`, not a refused no-language error
- compiler outputs do not emit language-specific guidance because of
  `unknown`
- doctor emits a non-fatal warning for persisted `unknown`
- current refusal text is no longer emitted for no-language-only init failure
- other write failures still refuse or error as before

### Expected RED Proof

Existing no-language `init --write` tests expect exit code 1 and refusal text.
Replace or add tests expecting successful profile creation with `unknown`.
These tests should fail before implementation.

Add wizard tests for manual input normalization, invalid-input re-prompting,
and partial-list rejection. They should fail before the prompt exists.

Add doctor and compiler/golden tests for `unknown`. They should fail until
`unknown` is explicitly inert in guidance and visible as a doctor warning.

### Expected GREEN Proof

CLI tests show successful dry-run, write, and JSON behavior with manual slugs
and with `unknown`. Compiler/golden tests show `unknown` does not select
language-specific guidance. Doctor tests show a non-fatal warning for persisted
`unknown`. Existing root-not-found, unsafe-path, permission, and profile-path
failure behavior remains unchanged.

### Test Command Guidance

Focused CLI tests first:

```bash
npm test -- --test-name-pattern "init"
```

Then run the full CLI package test command used by the repo.

### Likely File Ownership

- `apps/cli/src/index.ts`
- `apps/cli/src/wizard.ts`
- `apps/cli/src/index.test.ts`
- `apps/cli/src/wizard.test.ts`
- `packages/compiler/src/compiler.test.ts`
- `packages/doctor/src/doctor.ts`
- `packages/doctor/src/*.test.ts`

### Dependencies

Parallel-safe. Final integration depends on the scanner result shape from issue
1 only for end-to-end source-summary behavior.

### Parallelism Notes

Can be developed while issue 1 and issue 2 are in progress.

### Contract Impact

Changes `init --write` and `init --json --write` no-language behavior from
refusal to schema-compatible success fallback. This is an explicit product
contract change in the temporary spec.

### Security Impact

Manual input must be normalized, slug-validated, and bounded. No credentials,
paths, or environment values are requested.

### Documentation Impact

CLI docs and README updates must document manual language entry, `unknown`
fallback, and the doctor warning.

### Implementation Context

Schema v1 requires non-empty `stack.languages`. `unknown` satisfies the schema
without inventing an ecosystem-specific output contract.

### Review Expectations

Reviewers should confirm `unknown` does not trigger language-specific guidance
and that unrelated write failures are not hidden by the fallback. They should
also verify invalid manual entry re-prompts and JSON no-language fallback uses
the success shape.

## Issue 4: Detection-Source Reporting And Documentation

### Title

Detection-source reporting and documentation.

### Parent Spec Or Request

`docs/specs/phase-later/021-temporary-shallow-init-stack-scan.md`.

### Intent Summary

Make the temporary shallow scan auditable so users can understand why stack
values were chosen and correct false positives.

### Behavior Slice

Add compact source-summary reporting to wizard text and JSON output. Update CLI
documentation and README documentation to describe the temporary shallow scan,
manual language fallback, `unknown`, and React/JavaScript bridge behavior.

### Non-Goals

- no profile schema changes
- no generated artifact changes beyond stack values
- no verbose metadata dumps
- no file contents or dependency values in output
- no UI work outside CLI/wizard reporting
- no profile schema change for source summaries

### Acceptance Criteria

- wizard output includes a `Detection sources` section or equivalent compact
  source summary
- wizard output reports `(none)` when no source produced a signal
- JSON output includes `detectionSources`
- `detectionSources` entries are sorted by relative path ascending
- each JSON source has a relative metadata path
- each JSON source has signal arrays for `languages`, `frameworks`,
  `packageManagers`, and `testing`
- each signal array is sorted and unique
- JSON output does not include metadata file contents or dependency values
- CLI docs explain max depth 2
- CLI docs explain skipped dirs
- CLI docs explain manual language fallback and `unknown`
- CLI docs state phase-later 007 is the intended superseding design
- CLI docs state React/JavaScript detection is temporary and metadata-only
- README is updated with the temporary behavior, or explicitly defers temporary
  details to `docs/cli/README.md`
- docs state React Native and `peerDependencies` are out of scope

### Expected RED Proof

Add CLI output and JSON tests that expect ordered source summaries. They should
fail before reporting exists.

Add documentation checks if the repo has doc lint or link validation. They
should fail until docs are updated.

### Expected GREEN Proof

CLI output tests pass, JSON contract tests pass with stable ordering, and docs
describe the behavior without implying full monorepo support.

### Test Command Guidance

Focused CLI output tests first, then doc lint/check if available.

### Likely File Ownership

- `apps/cli/src/index.ts`
- `apps/cli/src/wizard.ts`
- `apps/cli/src/index.test.ts`
- `apps/cli/src/wizard.test.ts`
- `README.md`
- `docs/cli/README.md`

### Dependencies

Sequenced after issue 1 because reporting depends on source-summary data.

### Parallelism Notes

Documentation drafting can start early, but output contract tests should wait
for the final source-summary data shape.

### Contract Impact

Adds an init JSON field and wizard text. No-language fallback JSON now reports
normal success with fallback stack values. Does not change generated profile
schema.

### Security Impact

Reports must include relative paths and slugs only. No file contents,
dependency values, URLs, path dependency values, or secret-like values.

### Documentation Impact

Primary documentation issue.

### Implementation Context

Existing init output already reports detected stack and selected clients. The
source summary should extend that reporting without making generated files
larger or changing profile schema.

### Review Expectations

Reviewers should verify output examples are accurate, concise, and do not
promise per-package behavior. They should also verify `detectionSources`
ordering is stable and documentation flags the future phase-later 007 migration
risk.
